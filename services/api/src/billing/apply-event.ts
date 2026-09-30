/**
 * `billing.apply` (docs/api-contracts-async.md §2.2): one stored RevenueCat event, applied once.
 * The event only says whose purchase state changed; the customer is re-read from RevenueCat
 * before anything changes, and the event contributes only what the read cannot (the price paid,
 * the boost intent at purchase time, a refund of a one-off purchase). A processed event is a no-op
 * unless replayed on purpose from the console.
 */
import { DomainError } from '@cp/domain';
import type pg from 'pg';

import { graceDays } from './grace';
import { platformOf, priceMinor } from './map-subscriber';
import { rcWebhookEventSchema, type RcWebhookEvent, type RevenueCatClient } from './rc-client';
import { loadCatalogue } from './store-records';
import { syncSubscriber, type PurchaseFacts } from './sync-subscriber';

export interface ApplyDeps {
  readonly revenuecat: RevenueCatClient | undefined;
  readonly now?: () => Date;
}

export type ApplyOutcome =
  'applied' | 'duplicate' | 'test_event' | 'unknown_user' | 'owned_by_other_account';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** The Critterpass accounts an event concerns (RevenueCat's app user id is our uid). */
async function accountsOf(tx: pg.PoolClient, event: RcWebhookEvent): Promise<string[]> {
  const candidates = [
    event.app_user_id,
    event.original_app_user_id,
    ...(event.aliases ?? []),
    ...(event.transferred_from ?? []),
    ...(event.transferred_to ?? []),
  ].filter((id): id is string => typeof id === 'string' && UUID.test(id));
  if (candidates.length === 0) return [];
  const { rows } = await tx.query<{ id: string }>(
    'SELECT id FROM users WHERE id = ANY ($1::uuid[])',
    [[...new Set(candidates)]],
  );
  const known = new Set(rows.map((row) => row.id));
  const primary = candidates.find((id) => known.has(id));
  const transfer = [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])];
  return [...new Set([primary, ...transfer].filter((id): id is string => id !== undefined))].filter(
    (id) => known.has(id),
  );
}

/** What the event adds to a customer read. */
export function factsOf(event: RcWebhookEvent): PurchaseFacts | undefined {
  const platform = platformOf(event.store);
  const transactionId = event.transaction_id;
  const storeProductId = event.product_id;
  if (platform === undefined || !transactionId || !storeProductId) return undefined;
  const refunded = event.type === 'CANCELLATION' && event.cancel_reason === 'CUSTOMER_SUPPORT';
  return {
    platform,
    transactionId,
    originalTransactionId: event.original_transaction_id ?? null,
    storeProductId,
    price: priceMinor(event.price_in_purchased_currency, event.currency),
    storefront: event.country_code ?? null,
    offerCode: event.offer_code ?? null,
    intentId: event.subscriber_attributes?.['boost_intent_id']?.value ?? null,
    revoked: refunded ? 'refund' : null,
  };
}

interface StoredEventRow {
  readonly id: string;
  readonly type: string;
  readonly payload: { event?: unknown };
  readonly processed_at: Date | null;
}

/** Applies one stored event; the caller's transaction runs as app_system. */
export async function applyBillingEvent(
  tx: pg.PoolClient,
  deps: ApplyDeps,
  billingEventId: string,
  options: { readonly replay?: boolean } = {},
): Promise<ApplyOutcome> {
  const { rows } = await tx.query<StoredEventRow>(
    'SELECT id, type, payload, processed_at FROM billing_events WHERE id = $1 FOR UPDATE',
    [billingEventId],
  );
  const stored = rows[0];
  if (stored === undefined) throw new DomainError('NOT_FOUND', { reason: 'billing_event' });
  if (stored.processed_at !== null && options.replay !== true) return 'duplicate';
  const finish = async (outcome: ApplyOutcome): Promise<ApplyOutcome> => {
    await tx.query(
      `UPDATE billing_events SET processed_at = now(), attempts = attempts + 1,
         error = CASE WHEN $2 = 'applied' OR $2 = 'test_event' THEN NULL ELSE $2 END
       WHERE id = $1`,
      [stored.id, outcome],
    );
    return outcome;
  };
  if (stored.type === 'TEST') return finish('test_event');
  const event = rcWebhookEventSchema.parse(stored.payload.event);
  const accounts = await accountsOf(tx, event);
  if (accounts.length === 0) return finish('unknown_user');
  if (deps.revenuecat === undefined) {
    // Nothing is applied from an unverified event; the event stays stored for a later replay.
    throw new DomainError('STATE_INVALID', { reason: 'store_unverifiable' });
  }
  const now = (deps.now ?? (() => new Date()))();
  const days = await graceDays(tx);
  const catalogue = await loadCatalogue(tx);
  const facts = factsOf(event);
  let outcome: ApplyOutcome = 'applied';
  for (const [index, uid] of accounts.entries()) {
    const subscriber = await deps.revenuecat.getSubscriber(uid);
    const result = await syncSubscriber(tx, uid, subscriber, {
      now,
      graceDays: days,
      catalogue,
      facts: index === 0 ? facts : undefined,
    });
    if (index === 0 && facts !== undefined && result.ownedByOther.includes(facts.transactionId)) {
      outcome = 'owned_by_other_account';
    }
  }
  return finish(outcome);
}
