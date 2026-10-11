/**
 * Moving a planned trip to new dates on the real stack: only an organiser may; a trip still in
 * setup is sent to `lock_trip_dates`; a confirmed trip takes the new dates and its plan follows as
 * a new current version (each day on its new date, a stop at the same local time), a shorter trip
 * sends the stops of the days it loses back to Ideas, and the same dates change nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { changeTripDatesCommand } from '../../../src/planning/trip-settings/change-trip-dates';
import { day, seedCurrentPlan, tokyo, type SeededPlan } from '../../plan/plan-fixture';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
let plan: SeededPlan;
let org: SignedIn;
let member: SignedIn;

const change = (who: SignedIn, start: string, end: string) =>
  harness.run(who, 'change_trip_dates', { trip_id: crew.tripId, start, end });

const currentDays = async () =>
  (
    await harness.pool.query<{ day_no: number; date: string }>(
      `SELECT d.day_no, d.date::text AS date FROM plan_days d
         JOIN trips t ON t.current_version_id = d.version_id
        WHERE t.id = $1 ORDER BY d.day_no`,
      [crew.tripId],
    )
  ).rows;

const itemStart = async (stableId: string) =>
  (
    await harness.pool.query<{ starts_at: Date }>(
      `SELECT i.starts_at FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
        WHERE t.id = $1 AND i.stable_id = $2`,
      [crew.tripId, stableId],
    )
  ).rows[0]?.starts_at;

beforeAll(async () => {
  harness = await startSetupHarness((registry) => registry.register(changeTripDatesCommand));
  crew = await buildSetupCrew(harness, 2);
  [org, member] = crew.members as [SignedIn, SignedIn];
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
  await harness.pool.query(
    `UPDATE trips SET start_date = $2, end_date = $3, trip_length_days = 3, tz = 'Asia/Tokyo'
      WHERE id = $1`,
    [crew.tripId, plan.dates[0], plan.dates[2]],
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('changing a planned trip’s dates', () => {
  it('sends a trip still in setup to lock its dates instead', async () => {
    expect(errorOf(await change(org, day(50), day(52)))).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'trip_status' },
    });
  });

  it('is for organisers only', async () => {
    // The trip walks its real path to confirmed (the status guard allows nothing shorter).
    for (const status of ['setup', 'drafting', 'draft_review', 'proposed', 'confirmed']) {
      await harness.pool.query('UPDATE trips SET status = $2 WHERE id = $1', [crew.tripId, status]);
    }
    expect(errorOf(await change(member, day(50), day(52)))).toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('moves every day to its new date and keeps each stop’s local time', async () => {
    const result = resultOf<{ changed: boolean; moved_stops: unknown[] }>(
      await change(org, day(50), day(52)),
    );
    expect(result).toMatchObject({ changed: true, moved_stops: [] });
    expect(await currentDays()).toEqual([
      { day_no: 1, date: day(50) },
      { day_no: 2, date: day(51) },
      { day_no: 3, date: day(52) },
    ]);
    expect((await itemStart(plan.walk))?.toISOString()).toBe(tokyo(day(50), 9));
    expect((await itemStart(plan.museum))?.toISOString()).toBe(tokyo(day(51), 10));
  });

  it('changes nothing for the same dates', async () => {
    expect(resultOf(await change(org, day(50), day(52)))).toMatchObject({ changed: false });
  });

  it('moves the stops of the days a shorter trip loses', async () => {
    const result = resultOf<{ moved_stops: { stable_id: string; to: string; day_no?: number }[] }>(
      await change(org, day(55), day(55)),
    );
    // The museum has no place of its own: it moves onto the one day left.
    expect(result.moved_stops).toEqual([{ stable_id: plan.museum, to: 'day', day_no: 1 }]);
    expect(await currentDays()).toEqual([{ day_no: 1, date: day(55) }]);
  });
});
