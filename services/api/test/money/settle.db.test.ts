/**
 * Settling up on the real stack. The organiser paid a $600 dinner for six; each member owes $100.
 * Requests and nudges are the payee's (a second nudge the same day is too soon), a partial payment
 * leaves its remainder open, "remind everyone" runs once a day, and only the payee confirms. When
 * the last two confirms race, exactly one clears the trip: all six members get the Settled Tokek
 * with the same `granted_at`, once.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import {
  buildMoneyCrew,
  netsOf,
  startMoneyHarness,
  type MoneyCrew,
  type MoneyHarness,
} from './money-harness';

let harness: MoneyHarness;
let crew: MoneyCrew;
let payee: SignedIn;
let jordan: SignedIn;
let jordanPayment: string;

beforeAll(async () => {
  harness = await startMoneyHarness();
  crew = await buildMoneyCrew(harness, 6);
  payee = crew.organiser;
  jordan = crew.members[3]!;
  const added = await harness.run(payee, 'add_expense', {
    expense_id: generateUuidV7(),
    trip_id: crew.tripId,
    amount_minor: 60_000,
    currency: 'USD',
    payer_uid: payee.uid,
    split: { mode: 'equal', shares: crew.members.map((m) => ({ user_id: m.uid })) },
  });
  expect(added.status).toBe(200);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('asking to be paid back', () => {
  it('lets the payee request and nudge once a day, and nobody else confirm', async () => {
    jordanPayment = generateUuidV7();
    const requested = await harness.run(payee, 'request_payment', {
      payment_id: jordanPayment,
      trip_id: crew.tripId,
      from_uid: jordan.uid,
      amount_minor: 10_000,
      currency: 'USD',
    });
    expect(resultOf(requested)).toMatchObject({ status: 'requested' });
    const notPayee = await harness.run(jordan, 'confirm_paid', { payment_id: jordanPayment });
    expect(errorOf(notPayee).code).toBe('FORBIDDEN');
    const nudged = await harness.run(payee, 'nudge_payment', { payment_id: jordanPayment });
    expect(nudged.status).toBe(200);
    const again = await harness.run(payee, 'nudge_payment', { payment_id: jordanPayment });
    expect(errorOf(again).code).toBe('NUDGE_TOO_SOON');
  });

  it('reminds everyone at most once a day', async () => {
    const first = await harness.run(crew.members[2]!, 'remind_all_payments', {
      trip_id: crew.tripId,
    });
    expect(resultOf(first)).toEqual({ trip_id: crew.tripId, reminded: 1 });
    const second = await harness.run(payee, 'remind_all_payments', { trip_id: crew.tripId });
    expect(errorOf(second).code).toBe('RATE_LIMITED');
  });

  it('keeps the rest of a partial payment open', async () => {
    const marked = await harness.run(jordan, 'mark_paid', {
      payment_id: jordanPayment,
      method: 'paynow',
      amount_minor: 6_000,
    });
    expect(marked.status).toBe(200);
    const result = resultOf<{ status: string; remainder_payment_id: string }>(marked);
    expect(result.status).toBe('marked_paid');
    const { rows } = await harness.pool.query(
      'SELECT status, amount_minor::int AS amount FROM payments WHERE id = $1',
      [result.remainder_payment_id],
    );
    expect(rows).toEqual([{ status: 'requested', amount: 4_000 }]);
    const confirmed = await harness.run(payee, 'confirm_paid', { payment_id: jordanPayment });
    expect(resultOf(confirmed)).toMatchObject({ status: 'confirmed' });
    expect((await netsOf(harness, crew.crewId))['USD']?.[jordan.uid]).toBe(-4_000);
    const remainder = await harness.run(jordan, 'mark_paid', {
      payment_id: result.remainder_payment_id,
      method: 'cash',
    });
    expect(remainder.status).toBe(200);
    jordanPayment = result.remainder_payment_id;
  });
});

describe('the Settled Tokek', () => {
  it('goes to all six at one server time when the last two confirms race', async () => {
    const others = [1, 2, 4, 5].map((index) => crew.members[index]!);
    const payments: string[] = [];
    for (const member of others) {
      const id = generateUuidV7();
      const marked = await harness.run(member, 'mark_paid', {
        payment_id: id,
        method: 'bank',
        create: { trip_id: crew.tripId, to_uid: payee.uid, amount_minor: 10_000, currency: 'USD' },
      });
      expect(marked.status).toBe(200);
      payments.push(id);
    }
    for (const id of payments.slice(0, 3)) {
      const confirmed = await harness.run(payee, 'confirm_paid', { payment_id: id });
      expect(resultOf(confirmed)).not.toHaveProperty('settled_at');
    }
    const race = await Promise.all(
      [payments[3]!, jordanPayment].map((id) =>
        harness.run(payee, 'confirm_paid', { payment_id: id }),
      ),
    );
    expect(race.map((r) => r.status)).toEqual([200, 200]);
    const settled = race.filter((r) => resultOf<object>(r) && 'settled_at' in resultOf<object>(r));
    expect(settled).toHaveLength(1);

    const { rows } = await harness.pool.query<{ user_id: string; granted_at: Date }>(
      "SELECT user_id, granted_at FROM stickers WHERE trip_id = $1 AND kind = 'settled'",
      [crew.tripId],
    );
    expect(rows.map((row) => row.user_id).sort()).toEqual(crew.members.map((m) => m.uid).sort());
    expect(new Set(rows.map((row) => row.granted_at.toISOString())).size).toBe(1);
    const events = await harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'trip.settled' AND trip_id = $1",
      [crew.tripId],
    );
    expect(events.rowCount).toBe(1);
    expect(await netsOf(harness, crew.crewId)).toEqual({});
  });
});
