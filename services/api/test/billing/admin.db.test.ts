/**
 * The billing console. Support grants 30 days of Pass+ with a reason and it lands in the audit log
 * and the customer's timeline; support gives a trip promotional Boost; partner Offer Code batches
 * count their redemptions; an App Store extension is refused without a subscription, without the
 * store key, and past two a year; the badge counts failed webhooks; ops cannot open the area.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerBillingSources } from '../../src/billing/register';
import { startAdminHarness, type AdminHarness, type TestApp } from '../admin/harness';

let harness: AdminHarness;
let app: TestApp;
let support: string;
let ops: string;

beforeAll(async () => {
  registerBillingSources();
  harness = await startAdminHarness();
  await harness.seedOperator('support@critterpass.test', ['support']);
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  app = harness.app({ areas: harness.areas() });
  support = await app.signIn('support@critterpass.test');
  ops = await app.signIn('ops@critterpass.test');
}, 240_000);

afterAll(async () => {
  await app?.close();
  await harness?.stop();
});

interface Body {
  readonly entitlements: { readonly pass_plus: boolean };
  readonly error: { readonly code: string; readonly detail: { readonly reason: string } };
  readonly items: unknown[];
  readonly billing: unknown;
}

const json = async (response: Response) => ({
  status: response.status,
  body: (await response.json()) as Body,
});

describe('billing console', () => {
  it('grants 30 days of Pass+ with a reason, audited and on the timeline', async () => {
    const user = await harness.signInUser();
    const until = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const granted = await json(
      await app.command(support, 'grant_entitlement', {
        uid: user.uid,
        perk: 'pass_plus',
        until,
        reason: 'Webhook outage compensation',
      }),
    );
    expect(granted.status).toBe(200);
    const { rows } = await harness.pool.query(
      "SELECT reason FROM ops.admin_audit WHERE action = 'grant_entitlement' AND target_id = $1",
      [user.uid],
    );
    expect(rows).toEqual([{ reason: 'Webhook outage compensation' }]);
    const timeline = await json(
      await app.request(`/v1/admin/billing/users/${user.uid}`, { headers: { cookie: support } }),
    );
    expect(timeline.body.entitlements.pass_plus).toBe(true);
    expect(
      (await app.request(`/v1/admin/billing/users/${user.uid}`, { headers: { cookie: ops } }))
        .status,
    ).toBe(403);
  });

  it('gives a trip promotional Boost', async () => {
    const tripId = await withSystem(harness.pool, async (tx) => {
      const { rows: crews } = await tx.query<{ id: string }>(
        "INSERT INTO crews (name) VALUES ('Promo') RETURNING id",
      );
      const { rows } = await tx.query<{ id: string }>(
        "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
        [crews[0]!.id],
      );
      return rows[0]!.id;
    });
    const response = await json(
      await app.command(support, 'grant_trip_boost', {
        trip_id: tripId,
        days: 14,
        reason: 'Partner launch week',
      }),
    );
    expect(response.status).toBe(200);
    const { rows } = await harness.pool.query(
      'SELECT boost_active FROM trip_entitlements WHERE trip_id = $1',
      [tripId],
    );
    expect(rows[0]).toEqual({ boost_active: true });
    const again = await json(
      await app.command(support, 'grant_trip_boost', {
        trip_id: tripId,
        days: 14,
        reason: 'Twice',
      }),
    );
    expect(again.body.error.code).toBe('STATE_INVALID');
  });

  it('counts an Offer Code batch by the store transactions that carry it', async () => {
    const user = await harness.signInUser();
    await app.command(support, 'record_offer_code_batch', {
      name: 'Klook launch',
      platform: 'app_store',
      offer_ref: 'KLOOK26',
      size: 500,
    });
    await harness.pool.query(
      `INSERT INTO store_transactions (user_id, platform, transaction_id, product_key, store_product_id,
         purchased_at, offer_code) VALUES ($1, 'app_store', 'offer-1', 'pass_yearly', 'pass_yearly', now(), 'KLOOK26')`,
      [user.uid],
    );
    const batches = await json(
      await app.request('/v1/admin/billing/offer-batches', { headers: { cookie: support } }),
    );
    expect(batches.body.items).toEqual([
      expect.objectContaining({ name: 'Klook launch', size: 500, redeemed: 1 }),
    ]);
  });

  it('extends an App Store renewal only for a subscriber, with the store key, twice a year', async () => {
    const user = await harness.signInUser();
    const extend = async () =>
      json(
        await app.command(support, 'extend_store_renewal', {
          uid: user.uid,
          days: 30,
          reason: 'Outage compensation',
        }),
      );
    expect((await extend()).body.error.detail.reason).toBe('no_app_store_subscription');
    await harness.pool.query(
      `INSERT INTO subscriptions (user_id, platform, original_transaction_id, product_key, status, period_end)
       VALUES ($1, 'app_store', 'otx-extend', 'pass_monthly', 'active', now() + interval '10 days')`,
      [user.uid],
    );
    expect((await extend()).body.error.detail.reason).toBe('store_api_unconfigured');
    await harness.pool.query(
      `INSERT INTO ops.admin_audit (action, target_kind, target_id, reason)
       SELECT 'extend_store_renewal', 'user', $1, 'earlier' FROM generate_series(1, 2)`,
      [user.uid],
    );
    expect((await extend()).body.error.detail.reason).toBe('extension_quota_used');
  });

  it('badges failed webhooks and shows them in the health tiles', async () => {
    await harness.pool.query(
      `INSERT INTO billing_events (source, event_id, type, payload, attempts, error)
       VALUES ('revenuecat', 'failed-1', 'RENEWAL', '{}', 5, 'revenuecat subscriber read failed with 401')`,
    );
    const health = await json(
      await app.request('/v1/admin/billing/health', { headers: { cookie: support } }),
    );
    expect(health.body).toMatchObject({ failed_24h: 1, unprocessed: 1 });
    const counts = await json(
      await app.request('/v1/admin/counts', { headers: { cookie: support } }),
    );
    expect(counts.body.billing).toEqual({ count: 1, tone: 'urgent' });
  });
});
