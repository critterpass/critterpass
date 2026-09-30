/**
 * A boost follows its trip. New dates move its window (trip end + 7 days) and wake an ended boost
 * whose window reopens; a cancelled trip's boost moves to the crew's next trip, or becomes a credit
 * that never expires when there is none; any member spends a crew credit once; the window's close
 * ends the boost and pauses its perks.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expireBoost, followTripDates, onTripChanged } from '../../src/billing/boost-lifecycle';
import { buildMoneyCrew } from '../money/money-harness';
import { errorOf, resultOf } from '../setup/setup-harness';
import { startBillingHarness, type BillingHarness } from './billing-harness';

let harness: BillingHarness;

beforeAll(async () => {
  harness = await startBillingHarness();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function promoBoost(tripId: string, crewId: string, buyer: string): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO trip_boosts (trip_id, crew_id, buyer_id, source, starts_at, ends_at)
     VALUES ($1, $2, $3, 'promo', now(), now() + interval '180 days') RETURNING id`,
    [tripId, crewId, buyer],
  );
  return rows[0]!.id;
}

/** Walks the trip the legal way to cancelled: voting → won → setup → cancelled. */
async function cancel(tripId: string): Promise<void> {
  const chain = ['voting', 'won', 'setup', 'cancelled'];
  const { rows } = await harness.pool.query<{ status: string }>(
    'SELECT status FROM trips WHERE id = $1',
    [tripId],
  );
  for (const status of chain.slice(chain.indexOf(rows[0]!.status) + 1)) {
    await harness.pool.query('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
}

const boostsOn = async (tripId: string) =>
  (
    await harness.pool.query<{ status: string; ends_at: Date }>(
      'SELECT status, ends_at FROM trip_boosts WHERE trip_id = $1 ORDER BY created_at',
      [tripId],
    )
  ).rows;

describe('boost lifecycle', () => {
  it('moves the window with the dates, and ends at its close', async () => {
    const crew = await buildMoneyCrew(harness, 2);
    const boostId = await promoBoost(crew.tripId, crew.crewId, crew.organiser.uid);
    await harness.pool.query(
      "UPDATE trips SET start_date = '2026-11-02', end_date = '2026-11-09', tz = 'Asia/Tokyo' WHERE id = $1",
      [crew.tripId],
    );
    await withSystem(harness.pool, (tx) => followTripDates(tx, crew.tripId, new Date()));
    // End of 16 Nov in Tokyo (the last day + 7) is 15:00 UTC.
    expect((await boostsOn(crew.tripId))[0]!.ends_at.toISOString()).toBe(
      '2026-11-16T15:00:00.000Z',
    );

    const after = new Date('2026-11-17T00:00:00Z');
    await withSystem(harness.pool, (tx) => expireBoost(tx, boostId, after));
    expect((await boostsOn(crew.tripId))[0]!.status).toBe('ended');
    const { rows } = await harness.pool.query(
      'SELECT boost_active, seat_cap FROM trip_entitlements WHERE trip_id = $1',
      [crew.tripId],
    );
    expect(rows[0]).toEqual({ boost_active: false, seat_cap: 6 });

    // Dates moved out again: the ended boost is back.
    await harness.pool.query("UPDATE trips SET end_date = '2027-01-20' WHERE id = $1", [
      crew.tripId,
    ]);
    await withSystem(harness.pool, (tx) => followTripDates(tx, crew.tripId, after));
    expect((await boostsOn(crew.tripId))[0]!.status).toBe('active');
  });

  it("moves a cancelled trip's boost to the next trip, else leaves a credit a member spends once", async () => {
    const crew = await buildMoneyCrew(harness, 2);
    const member = crew.members[1]!;
    await promoBoost(crew.tripId, crew.crewId, crew.organiser.uid);
    const { rows: next } = await harness.pool.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [crew.crewId],
    );
    const nextTrip = next[0]!.id;
    await cancel(crew.tripId);
    await withSystem(harness.pool, (tx) => onTripChanged(tx, crew.tripId, new Date()));
    expect((await boostsOn(crew.tripId))[0]!.status).toBe('moved');
    expect((await boostsOn(nextTrip))[0]!.status).toBe('active');

    await cancel(nextTrip);
    await withSystem(harness.pool, (tx) => onTripChanged(tx, nextTrip, new Date()));
    expect((await boostsOn(nextTrip))[0]!.status).toBe('credit');
    const { rows: credits } = await harness.pool.query<{ id: string }>(
      "SELECT id FROM boost_credits WHERE crew_id = $1 AND reason = 'trip_cancelled'",
      [crew.crewId],
    );
    expect(credits).toHaveLength(1);

    const { rows: third } = await harness.pool.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [crew.crewId],
    );
    await harness.pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
      [third[0]!.id, member.uid],
    );
    const apply = () =>
      harness.run(member, 'apply_boost_credit', {
        credit_id: credits[0]!.id,
        trip_id: third[0]!.id,
      });
    expect(resultOf(await apply())).toMatchObject({ credit_id: credits[0]!.id });
    expect((await boostsOn(third[0]!.id))[0]!.status).toBe('active');
    expect(errorOf(await apply())).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'credit_used' },
    });
  });

  it('lets only the buyer move a boost', async () => {
    const crew = await buildMoneyCrew(harness, 2);
    const boostId = await promoBoost(crew.tripId, crew.crewId, crew.organiser.uid);
    const response = await harness.run(crew.members[1]!, 'move_boost', {
      boost_id: boostId,
      to_trip_id: crew.tripId,
    });
    expect(errorOf(response).code).toBe('FORBIDDEN');
  });
});
