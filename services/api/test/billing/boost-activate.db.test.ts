/**
 * A Trip Boost purchase activates in one transaction: the boost on the locked trip, the intent
 * fulfilled, the trip's perks (16 seats, unlimited redrafts, live map) and, for a split, one
 * expense and one IOU per member that sum exactly to what the store charged, the buyer absorbing
 * the odd cents. The same purchase reported again (webhook redelivery, the app's report, the
 * reconcile) activates nothing new; a purchase reported by the app before its priced webhook gets
 * its boost at once and its split once the price arrives.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildMoneyCrew, type MoneyCrew } from '../money/money-harness';
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

async function lock(crew: MoneyCrew, split: boolean): Promise<string> {
  const buyer = crew.members[1]!;
  const response = await harness.run(buyer, 'create_boost_intent', {
    intent_id: generateUuidV7(),
    trip_id: crew.tripId,
    product_key: 'boost_trip',
    split_mode: split ? 'split' : 'cover',
    member_uids: split ? crew.members.map((member) => member.uid) : [],
  });
  return resultOf<{ intent_id: string }>(response).intent_id;
}

async function boostOf(tripId: string) {
  const { rows } = await harness.pool.query<{
    id: string;
    status: string;
    expense_id: string | null;
  }>('SELECT id, status, expense_id FROM trip_boosts WHERE trip_id = $1', [tripId]);
  return rows;
}

async function ledger(expenseId: string) {
  const { rows } = await harness.pool.query<{ debtor_id: string; amount_minor: string }>(
    "SELECT debtor_id, amount_minor::text FROM ledger_entries WHERE source_kind = 'boost_iou' AND source_id = $1",
    [expenseId],
  );
  return rows;
}

describe('boost activation', () => {
  it('splits $11.99 seven ways exactly, the buyer absorbing the remainder, once', async () => {
    const crew = await buildMoneyCrew(harness, 7);
    const buyer = crew.members[1]!;
    const intentId = await lock(crew, true);
    const txn = `3000000100${Date.now()}`;
    const purchase = boostPurchase(buyer.uid, intentId, txn);
    harness.revenuecat.set(buyer.uid, purchase.subscriber);
    const eventId = await storeEvent(harness, purchase.webhook);
    expect(await apply(harness, eventId, new Date())).toBe('applied');

    const boosts = await boostOf(crew.tripId);
    expect(boosts).toHaveLength(1);
    expect(boosts[0]!.status).toBe('active');
    const expenseId = boosts[0]!.expense_id!;
    const { rows: shares } = await harness.pool.query<{ user_id: string; computed_minor: string }>(
      'SELECT user_id, computed_minor::text FROM expense_shares WHERE expense_id = $1',
      [expenseId],
    );
    const byUser = Object.fromEntries(shares.map((s) => [s.user_id, Number(s.computed_minor)]));
    expect(Object.values(byUser).reduce((a, b) => a + b, 0)).toBe(1199);
    expect(byUser[buyer.uid]).toBe(1199 - 6 * 171);
    const ious = await ledger(expenseId);
    expect(ious).toHaveLength(6);
    expect(ious.every((iou) => iou.amount_minor === '171' && iou.debtor_id !== buyer.uid)).toBe(
      true,
    );
    const { rows: perks } = await harness.pool.query(
      'SELECT boost_active, seat_cap, live_map FROM trip_entitlements WHERE trip_id = $1',
      [crew.tripId],
    );
    expect(perks[0]).toEqual({ boost_active: true, seat_cap: 16, live_map: true });
    const { rows: intents } = await harness.pool.query(
      'SELECT status FROM boost_intents WHERE id = $1',
      [intentId],
    );
    expect(intents[0]).toEqual({ status: 'fulfilled' });

    // Reported again three ways: nothing new.
    expect(await apply(harness, eventId, new Date(), true)).toBe('applied');
    const reported = await harness.run(buyer, 'fulfil_purchase', {
      source: 'client_sync',
      platform: 'app_store',
      transaction_id: txn,
      store_product_id: 'boost_trip',
      intent_id: intentId,
    });
    expect(resultOf(reported)).toMatchObject({ status: 'fulfilled', boost_id: boosts[0]!.id });
    expect(await boostOf(crew.tripId)).toEqual(boosts);
    expect(await ledger(expenseId)).toHaveLength(6);
  });

  it('boosts at once from the app, and adds the split when the priced webhook lands', async () => {
    const crew = await buildMoneyCrew(harness, 3);
    const buyer = crew.members[1]!;
    const intentId = await lock(crew, true);
    const txn = `3000000200${Date.now()}`;
    const purchase = boostPurchase(buyer.uid, intentId, txn);
    harness.revenuecat.set(buyer.uid, purchase.subscriber);
    const reported = await harness.run(buyer, 'fulfil_purchase', {
      source: 'client_sync',
      platform: 'app_store',
      transaction_id: txn,
      store_product_id: 'boost_trip',
      intent_id: intentId,
    });
    const boostId = resultOf<{ boost_id: string }>(reported).boost_id;
    expect(boostId).toBeTruthy();
    expect((await boostOf(crew.tripId))[0]).toMatchObject({ status: 'active', expense_id: null });

    await apply(harness, await storeEvent(harness, purchase.webhook), new Date());
    const [boost] = await boostOf(crew.tripId);
    expect(boost!.expense_id).not.toBeNull();
    const ious = await ledger(boost!.expense_id!);
    expect(ious.map((iou) => Number(iou.amount_minor))).toEqual([399, 399]);
  });

  it('turns a second purchase for a boosted trip into a credit, not a second boost', async () => {
    const crew = await buildMoneyCrew(harness, 2);
    const buyer = crew.members[1]!;
    const first = await lock(crew, false);
    const firstTxn = `3000000300${Date.now()}`;
    const one = boostPurchase(buyer.uid, first, firstTxn);
    harness.revenuecat.set(buyer.uid, one.subscriber);
    await apply(harness, await storeEvent(harness, one.webhook), new Date());

    const secondTxn = `${firstTxn}9`;
    const two = boostPurchase(buyer.uid, first, secondTxn);
    harness.revenuecat.set(buyer.uid, two.subscriber);
    await apply(harness, await storeEvent(harness, two.webhook), new Date());
    expect(await boostOf(crew.tripId)).toHaveLength(1);
    const { rows } = await harness.pool.query(
      `SELECT c.reason, c.crew_id FROM boost_credits c JOIN store_transactions t
          ON t.id = c.store_transaction_id WHERE t.transaction_id = $1`,
      [secondTxn],
    );
    expect(rows).toEqual([{ reason: 'duplicate_purchase', crew_id: crew.crewId }]);
  });
});
