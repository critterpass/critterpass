/**
 * A refunded boost. The boost is revoked and its perks stop; of its split, only the IOUs nobody
 * has paid back are reversed: a member who already paid the buyer keeps that settled, and nothing
 * is done twice when the refund is reported again.
 */
import { generateUuidV7 } from '@cp/domain';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { revokePurchase } from '../../src/commands/billing/revoke-purchase';
import { buildMoneyCrew } from '../money/money-harness';
import { resultOf } from '../setup/setup-harness';
import {
  apply,
  boostPurchase,
  startBillingHarness,
  storeEvent,
  type BillingHarness,
} from './billing-harness';

let harness: BillingHarness;

beforeAll(async () => {
  harness = await startBillingHarness();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('boost refund', () => {
  it('revokes the boost and reverses only the unsettled IOUs, once', async () => {
    const crew = await buildMoneyCrew(harness, 3);
    const [buyer, paid, unpaid] = [crew.members[0]!, crew.members[1]!, crew.members[2]!];
    const lock = await harness.run(buyer, 'create_boost_intent', {
      intent_id: generateUuidV7(),
      trip_id: crew.tripId,
      product_key: 'boost_trip',
      split_mode: 'split',
      member_uids: crew.members.map((member) => member.uid),
    });
    const intentId = resultOf<{ intent_id: string }>(lock).intent_id;
    const txn = `3000000400${Date.now()}`;
    const purchase = boostPurchase(buyer.uid, intentId, txn);
    harness.revenuecat.set(buyer.uid, purchase.subscriber);
    await apply(harness, await storeEvent(harness, purchase.webhook), new Date());

    // One member settles their 399 with the buyer before the refund.
    await withSystem(harness.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO payments (crew_id, trip_id, from_id, to_id, amount_minor, currency, status,
           confirmed_at, created_by)
         VALUES ($1, $2, $3, $4, 399, 'USD', 'confirmed', now(), $3) RETURNING id`,
        [crew.crewId, crew.tripId, paid.uid, buyer.uid],
      );
      await tx.query(
        `INSERT INTO ledger_entries (crew_id, trip_id, debtor_id, creditor_id, amount_minor,
           currency, source_kind, source_id)
         VALUES ($1, $2, $3, $4, 399, 'USD', 'payment', $5)`,
        [crew.crewId, crew.tripId, buyer.uid, paid.uid, rows[0]!.id],
      );
    });

    const refund = () =>
      withSystem(harness.pool, (tx) =>
        revokePurchase(
          tx,
          { platform: 'app_store', transaction_id: txn, reason: 'refund' },
          new Date(),
        ),
      );
    expect(await refund()).toMatchObject({ revoked: true });
    const { rows: boosts } = await harness.pool.query(
      'SELECT status, revoke_reason FROM trip_boosts WHERE trip_id = $1',
      [crew.tripId],
    );
    expect(boosts).toEqual([{ status: 'revoked', revoke_reason: 'refund' }]);
    const { rows: perks } = await harness.pool.query(
      'SELECT boost_active FROM trip_entitlements WHERE trip_id = $1',
      [crew.tripId],
    );
    expect(perks[0]).toEqual({ boost_active: false });
    const reversals = async () =>
      (
        await harness.pool.query<{ creditor_id: string }>(
          `SELECT r.creditor_id FROM ledger_entries r JOIN ledger_entries e ON e.id = r.reverses_id
            WHERE e.source_kind = 'boost_iou' AND e.crew_id = $1`,
          [crew.crewId],
        )
      ).rows;
    expect(await reversals()).toEqual([{ creditor_id: unpaid.uid }]);
    expect(await refund()).toMatchObject({ revoked: false });
    expect(await reversals()).toHaveLength(1);
  });
});
