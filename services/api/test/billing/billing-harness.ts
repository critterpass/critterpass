/**
 * The real stack for the billing suites: the money harness (Testcontainers Postgres + Redis,
 * sessions, command doors, a send-only job producer) with the billing commands, the RevenueCat
 * webhook and the internal billing door mounted, and the billing entitlement sources registered.
 * RevenueCat itself is the one test double: the real REST client reads recorded customer
 * responses (`fixtures/*.json`) through an injected `fetch`, so its parsing is exercised as well.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { withSystem } from '@cp/db';
import type pg from 'pg';

import { applyBillingEvent, type ApplyOutcome } from '../../src/billing/apply-event';
import { registerBillingDoor } from '../../src/billing/internal-door';
import { createRevenueCatClient, type RevenueCatClient } from '../../src/billing/rc-client';
import { billingOps, registerBillingSources } from '../../src/billing/register';
import { registerBillingCommands } from '../../src/commands/billing';
import { registerBoostCommands } from '../../src/commands/boost';
import type { CommandRegistry } from '../../src/commands/_framework/registry';
import { createKillSwitches, type KillSwitches } from '../../src/ops/kill-switches';
import { registerRevenueCatWebhook } from '../../src/routes/webhooks/revenuecat';
import { startMoneyHarness, type MoneyHarness } from '../money/money-harness';

export const WEBHOOK_AUTH = `Bearer ${'hook'.repeat(6)}`;
export const DOOR_SECRET = 'door'.repeat(8);

/** RevenueCat's customer endpoint over recorded responses, per app user id. */
export class RecordedRevenueCat {
  private readonly customers = new Map<string, unknown>();
  requests = 0;

  set(uid: string, response: unknown): void {
    this.customers.set(uid, response);
  }

  readonly fetch: typeof fetch = (input) => {
    this.requests += 1;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const uid = decodeURIComponent(url.split('/subscribers/')[1] ?? '');
    const body = this.customers.get(uid) ?? {
      subscriber: { original_app_user_id: uid, subscriptions: {}, non_subscriptions: {} },
    };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };

  client(): RevenueCatClient {
    return createRevenueCatClient({ secretKey: 'sk_test_recorded', fetch: this.fetch });
  }
}

export interface BillingHarness extends MoneyHarness {
  readonly revenuecat: RecordedRevenueCat;
  readonly switches: KillSwitches;
}

export async function startBillingHarness(
  extra?: (registry: CommandRegistry, deps: { revenuecat: RevenueCatClient }) => void,
): Promise<BillingHarness> {
  registerBillingSources();
  const revenuecat = new RecordedRevenueCat();
  const client = revenuecat.client();
  const switches: { current?: KillSwitches } = {};
  const lazySwitches = {
    assertOn: (key: string) => {
      if (switches.current === undefined) throw new Error('kill switches not ready');
      return switches.current.assertOn(key);
    },
  };
  const harness = await startMoneyHarness(
    (registry) => {
      registerBillingCommands(registry, { revenuecat: client, switches: lazySwitches });
      registerBoostCommands(registry, { switches: lazySwitches });
      extra?.(registry, { revenuecat: client });
    },
    (app, deps) => {
      registerRevenueCatWebhook(app, { pool: deps.pool, authorization: WEBHOOK_AUTH });
      registerBillingDoor(app, {
        secret: DOOR_SECRET,
        ops: billingOps({ pool: deps.pool, revenuecat: client, logger: { warn: () => undefined } }),
      });
    },
  );
  switches.current = createKillSwitches(harness.pool);
  return { ...harness, revenuecat, switches: switches.current };
}

export interface FixtureStep {
  readonly now: string;
  readonly webhook: { event: { id: string } & Record<string, unknown> };
  readonly subscriber: unknown;
  readonly expect: {
    readonly product: string;
    readonly platform?: string;
    readonly status: string;
    readonly pass_plus: boolean;
    readonly transactions: number;
    readonly grace_ends_at?: string;
    readonly also?: Record<string, string>;
    readonly revoked_transaction?: string;
  };
}

/** A recorded scenario with `$UID` bound to a real account. */
export function loadFixture(name: string, uid: string): { steps: FixtureStep[] } {
  const raw = readFileSync(path.join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf8');
  // Event ids are unique per account, so one scenario can be replayed for several accounts.
  const bound = raw.replaceAll('$UID', uid).replaceAll('"rc-evt-', `"rc-evt-${uid}-`);
  return JSON.parse(bound) as { steps: FixtureStep[] };
}

/** Stores one webhook body as the route would, returning the stored event's id. */
export async function storeEvent(harness: BillingHarness, body: unknown): Promise<string> {
  const response = await harness.request('/webhooks/revenuecat', {
    method: 'POST',
    headers: { authorization: WEBHOOK_AUTH },
    body: JSON.stringify(body),
  });
  if (response.status !== 200) throw new Error(`webhook refused: ${response.status}`);
  const { rows } = await harness.pool.query<{ id: string }>(
    "SELECT id FROM billing_events WHERE source = 'revenuecat' AND event_id = $1",
    [(body as { event: { id: string } }).event.id],
  );
  return rows[0]!.id;
}

export function apply(
  harness: BillingHarness,
  billingEventId: string,
  now: Date,
  replay = false,
): Promise<ApplyOutcome> {
  return withSystem(harness.pool, (tx) =>
    applyBillingEvent(
      tx,
      { revenuecat: harness.revenuecat.client(), now: () => now },
      billingEventId,
      {
        replay,
      },
    ),
  );
}

export interface BillingState {
  readonly subscriptions: Record<
    string,
    { status: string; platform: string; grace: string | null }
  >;
  readonly passPlus: boolean;
  readonly transactions: number;
  readonly events: number;
}

/** Everything a billing change can move for one account. */
export async function stateOf(pool: pg.Pool, uid: string): Promise<BillingState> {
  const subs = await pool.query<{
    product_key: string;
    status: string;
    platform: string;
    grace_ends_at: Date | null;
  }>('SELECT product_key, status, platform, grace_ends_at FROM subscriptions WHERE user_id = $1', [
    uid,
  ]);
  const ent = await pool.query<{ pass_plus: boolean }>(
    'SELECT pass_plus FROM user_entitlements WHERE user_id = $1',
    [uid],
  );
  const txns = await pool.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM store_transactions WHERE user_id = $1',
    [uid],
  );
  const events = await pool.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM domain_events WHERE type LIKE 'subscription.%' AND payload->>'user_id' = $1",
    [uid],
  );
  return {
    subscriptions: Object.fromEntries(
      subs.rows.map((row) => [
        row.product_key,
        {
          status: row.status,
          platform: row.platform,
          grace: row.grace_ends_at?.toISOString() ?? null,
        },
      ]),
    ),
    passPlus: ent.rows[0]?.pass_plus ?? false,
    transactions: Number(txns.rows[0]?.n ?? 0),
    events: Number(events.rows[0]?.n ?? 0),
  };
}

/** A recorded Trip Boost purchase for `uid` under `intentId`, as transaction `txn`. */
export function boostPurchase(
  uid: string,
  intentId: string,
  txn: string,
): { webhook: { event: { id: string } }; subscriber: unknown } {
  const raw = readFileSync(
    path.join(import.meta.dirname, 'fixtures', 'boost-trip-purchase.json'),
    'utf8',
  );
  return JSON.parse(
    raw.replaceAll('$UID', uid).replaceAll('$INTENT', intentId).replaceAll('$TXN', txn),
  ) as { webhook: { event: { id: string } }; subscriber: unknown };
}
