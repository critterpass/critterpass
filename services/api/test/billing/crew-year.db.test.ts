/**
 * Crew yearly. Bought under a crew's trip lock it boosts every trip of that crew and gives its
 * buyer Pass+; a split writes IOUs for the first purchase only, never for a renewal; a renewal
 * extends the grant; the buyer may move it to another of their crews once per period.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildMoneyCrew } from '../money/money-harness';
import { errorOf, resultOf } from '../setup/setup-harness';
import {
  apply,
  startBillingHarness,
  stateOf,
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

const DAY = 86_400_000;

function crewYearEvent(uid: string, intent: string, type: string, txn: string, start: number) {
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    webhook: {
      api_version: '1.0',
      event: {
        id: `rc-evt-cy-${txn}`,
        type,
        app_user_id: uid,
        original_app_user_id: uid,
        product_id: 'boost_crew_year',
        purchased_at_ms: start,
        expiration_at_ms: start + 365 * DAY,
        environment: 'SANDBOX',
        store: 'APP_STORE',
        transaction_id: txn,
        original_transaction_id: 'cy-original',
        currency: 'USD',
        price_in_purchased_currency: 59.99,
        subscriber_attributes: { boost_intent_id: { value: intent } },
      },
    },
    subscriber: {
      subscriber: {
        original_app_user_id: uid,
        subscriptions: {
          boost_crew_year: {
            purchase_date: iso(start),
            expires_date: iso(start + 365 * DAY),
            store: 'app_store',
            is_sandbox: true,
            store_transaction_id: txn,
          },
        },
        non_subscriptions: {},
        subscriber_attributes: { boost_intent_id: { value: intent } },
      },
    },
  };
}

describe('crew yearly', () => {
  it('boosts the crew, splits the first year only, renews and rebinds once', async () => {
    const crew = await buildMoneyCrew(harness, 3);
    const buyer = crew.members[0]!;
    const lock = await harness.run(buyer, 'create_boost_intent', {
      intent_id: generateUuidV7(),
      trip_id: crew.tripId,
      product_key: 'boost_crew_year',
      split_mode: 'split',
      member_uids: crew.members.map((member) => member.uid),
    });
    const intentId = resultOf<{ intent_id: string }>(lock).intent_id;
    const start = Date.now() - DAY;
    const first = crewYearEvent(buyer.uid, intentId, 'INITIAL_PURCHASE', `cy-1-${start}`, start);
    harness.revenuecat.set(buyer.uid, first.subscriber);
    await apply(harness, await storeEvent(harness, first.webhook), new Date());

    const { rows: grants } = await harness.pool.query<{
      id: string;
      crew_id: string;
      split_expense_id: string;
    }>('SELECT id, crew_id, split_expense_id FROM crew_year_grants WHERE buyer_id = $1', [
      buyer.uid,
    ]);
    expect(grants).toHaveLength(1);
    expect(grants[0]!.crew_id).toBe(crew.crewId);
    expect((await stateOf(harness.pool, buyer.uid)).passPlus).toBe(true);
    const perks = await harness.pool.query(
      'SELECT boost_active FROM trip_entitlements WHERE trip_id = $1',
      [crew.tripId],
    );
    expect(perks.rows[0]).toEqual({ boost_active: true });
    const ious = async () =>
      (
        await harness.pool.query(
          "SELECT 1 FROM ledger_entries WHERE source_kind = 'boost_iou' AND crew_id = $1",
          [crew.crewId],
        )
      ).rows.length;
    expect(await ious()).toBe(2);

    const renewal = crewYearEvent(
      buyer.uid,
      intentId,
      'RENEWAL',
      `cy-2-${start}`,
      start + 365 * DAY,
    );
    harness.revenuecat.set(buyer.uid, renewal.subscriber);
    await apply(harness, await storeEvent(harness, renewal.webhook), new Date());
    expect(await ious()).toBe(2);
    const { rows: renewed } = await harness.pool.query<{ valid_to: Date }>(
      'SELECT valid_to FROM crew_year_grants WHERE id = $1',
      [grants[0]!.id],
    );
    expect(renewed[0]!.valid_to.getTime()).toBe(start + 730 * DAY);

    const other = await buildMoneyCrew(harness, 2);
    await harness.pool.query(
      "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')",
      [other.crewId, buyer.uid],
    );
    const rebind = () =>
      harness.run(buyer, 'rebind_crew_year', { grant_id: grants[0]!.id, crew_id: other.crewId });
    const rebound = await rebind();
    expect(rebound.body).toMatchObject({ result: { crew_id: other.crewId } });
    const back = await harness.run(buyer, 'rebind_crew_year', {
      grant_id: grants[0]!.id,
      crew_id: crew.crewId,
    });
    expect(errorOf(back)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'rebind_used' },
    });
    const moved = await harness.pool.query(
      'SELECT boost_active FROM trip_entitlements WHERE trip_id = $1',
      [other.tripId],
    );
    expect(moved.rows[0]).toEqual({ boost_active: true });
  });
});
