/**
 * Someone who gets on a trip after its trip day was laid out, against a migrated Postgres with
 * recorded Mapbox Directions: the next run of the recompute puts them on every leave-by that has
 * not fired, with their readiness row, without moving a timer or telling the crew anything; a
 * leave-by that already fired keeps the people it knocked; and their next morning's briefing is
 * armed in the same run.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { refreshTripDay } from '../../src/jobs/trip-day/leaveby-recompute';
import { NOW, recordedMapboxRouter, startTripDayWorld, type TripDayWorld } from './trip-day-world';

let world: TripDayWorld;
const { router } = recordedMapboxRouter();

interface LeaveByRow {
  id: string;
  plan_item_id: string;
  leave_at: Date;
  participant_ids: string[];
  version: number;
}

const leaveBys = () =>
  world.q<LeaveByRow>(
    `SELECT id, plan_item_id, leave_at, participant_ids, version FROM leave_bys
      WHERE trip_id = $1 ORDER BY leave_at`,
    [world.tripId],
  );

const readinessOf = async (leaveById: string) =>
  (
    await world.q<{ user_id: string }>(
      "SELECT user_id FROM readiness WHERE leave_by_id = $1 AND state = 'not_up'",
      [leaveById],
    )
  ).map((row) => row.user_id);

const timers = (leaveById: string) =>
  world.q<{ slot: string; due_at: Date }>(
    `SELECT slot, due_at FROM scheduled_events
      WHERE kind = 'leaveby.schedule' AND ref_id = $1 AND status = 'pending' ORDER BY due_at`,
    [leaveById],
  );

const announced = async () =>
  Number(
    (
      await world.q<{ n: string }>(
        "SELECT count(*) AS n FROM domain_events WHERE type = 'leave_by.changed' AND trip_id = $1",
        [world.tripId],
      )
    )[0]?.n,
  );

/** A friend who joins the crew and takes a seat on the trip; resolves to their ids. */
async function seatNewcomer(name: string): Promise<{ uid: string; participantId: string }> {
  const uid = randomUUID();
  await world.q(
    `INSERT INTO users (id, status, home_airport, display_name, tz)
     VALUES ($1, 'registered', 'SGN', $2, 'Asia/Ho_Chi_Minh')`,
    [uid, name],
  );
  await world.q("INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')", [
    world.crewId,
    uid,
  ]);
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')
     RETURNING id`,
    [world.tripId, uid],
  );
  return { uid, participantId: (row as { id: string }).id };
}

beforeAll(async () => {
  world = await startTripDayWorld();
}, 240_000);

afterAll(async () => {
  await world.stop();
});

describe('a seat taken after the trip day was laid out', () => {
  it('joins every leave-by that has not fired, quietly, and gets a morning briefing', async () => {
    await refreshTripDay(world.harness.pool, world.tripId, router, NOW);
    const [trekBefore, flightBefore] = await leaveBys();
    expect(trekBefore?.participant_ids).toHaveLength(4);
    const trekTimers = await timers(trekBefore!.id);
    const told = await announced();

    const friend = await seatNewcomer('Khoa Le');
    const run = await refreshTripDay(world.harness.pool, world.tripId, router, NOW);
    expect(run).toMatchObject({ changed: 0, cancelled: 0, briefings: 5 });

    const [trek, flight] = await leaveBys();
    for (const [before, after] of [
      [trekBefore, trek],
      [flightBefore, flight],
    ]) {
      expect(after?.participant_ids).toHaveLength(5);
      expect(after?.participant_ids).toContain(friend.uid);
      expect(await readinessOf(after!.id)).toContain(friend.uid);
      // Nothing moved: same time, same version, same timers, nobody told.
      expect(after?.leave_at).toEqual(before?.leave_at);
      expect(after?.version).toBe(before?.version);
    }
    expect(await timers(trek!.id)).toEqual(trekTimers);
    expect(await announced()).toBe(told);

    // Their next morning on the trip's clock: 15 October.
    const briefing = await world.q<{ data: { local_date: string } }>(
      `SELECT data FROM scheduled_events
        WHERE kind = 'briefing.build' AND ref_id = $1 AND status = 'pending'`,
      [friend.participantId],
    );
    expect(briefing.map((row) => row.data.local_date)).toEqual(['2026-10-15']);
  });

  it('leaves a leave-by that already fired with the people it knocked', async () => {
    const late = await seatNewcomer('Vy Tran');
    // 03:40 in Bali: the trek's 03:20 leave-by has fired, the trek itself is still ahead.
    const afterTrekLeaveBy = new Date('2026-10-14T19:40:00Z');
    await refreshTripDay(world.harness.pool, world.tripId, router, afterTrekLeaveBy);

    const [trek, flight] = await leaveBys();
    expect(trek?.plan_item_id).toBe(world.items.trek);
    expect(trek?.participant_ids).not.toContain(late.uid);
    expect(await readinessOf(trek!.id)).not.toContain(late.uid);
    expect(flight?.participant_ids).toContain(late.uid);
    expect(await readinessOf(flight!.id)).toContain(late.uid);
  });
});
