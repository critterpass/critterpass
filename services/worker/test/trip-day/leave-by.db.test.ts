/**
 * Leave-bys against a migrated Postgres, routing on recorded Mapbox Directions: the Batur pickup
 * and the airport run get the expected local times, the dinner does not get one, a rerun with
 * nothing changed changes nothing, a moved pickup re-arms each timer exactly once, a vanished item
 * is cancelled, and the timers fire the remote alarm copy for unconfirmed sleepers and one crew
 * knock at T0.
 *
 * On a trip with two stops, where guides go by city, the leave-by, the quests and the briefing of
 * a later stop's day are in that stop's guide's voice; the first stop's days, a one-stop trip and
 * every trip while guides do not go by city keep the trip's own guide.
 */
import { withSystem } from '@cp/db';
import { toLocalWallTime } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { leaveByLoader } from '../../src/jobs/la/leave-by';
import { dayGuide, questTrip } from '../../src/jobs/quests/day-context';
import { recomputeLeaveBys } from '../../src/jobs/trip-day/leaveby-recompute';
import { runLeaveByTimer } from '../../src/jobs/trip-day/leaveby-schedule';
import {
  NOW,
  recordedMapboxRouter,
  startTripDayWorld,
  TRIP_TZ,
  type TripDayWorld,
} from './trip-day-world';

let world: TripDayWorld;
const { router, requests } = recordedMapboxRouter();

interface LeaveByRow {
  id: string;
  plan_item_id: string;
  leave_at: Date;
  state: string;
  legs: { source: string; traffic: boolean; minutes: number }[];
}

async function leaveBys(): Promise<LeaveByRow[]> {
  return world.q<LeaveByRow>(
    'SELECT id, plan_item_id, leave_at, state, legs FROM leave_bys WHERE trip_id = $1 ORDER BY leave_at',
    [world.tripId],
  );
}

async function changedEvents(): Promise<number> {
  const rows = await world.q<{ n: string }>(
    "SELECT count(*) AS n FROM domain_events WHERE type = 'leave_by.changed' AND trip_id = $1",
    [world.tripId],
  );
  return Number(rows[0]?.n);
}

async function timers(leaveById: string): Promise<{ slot: string; due_at: Date }[]> {
  return world.q(
    `SELECT slot, due_at FROM scheduled_events
      WHERE kind = 'leaveby.schedule' AND ref_id = $1 AND status = 'pending' ORDER BY due_at`,
    [leaveById],
  );
}

const local = (at: Date) => toLocalWallTime(at, TRIP_TZ).time.slice(0, 5);

beforeAll(async () => {
  world = await startTripDayWorld();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('leaveby.recompute', () => {
  it('computes the Batur pickup and the airport run, and skips the dinner', async () => {
    const result = await recomputeLeaveBys(world.harness.pool, world.tripId, router, NOW);
    expect(result).toEqual({ changed: 2, cancelled: 0 });
    const [trek, flight] = await leaveBys();
    expect(trek!.plan_item_id).toBe(world.items.trek);
    // Pickup at the villa gate 03:30, 10-minute buffer.
    expect(local(trek!.leave_at)).toBe('03:20');
    expect(trek!.legs[0]).toMatchObject({ source: 'pickup' });
    // Flight 09:40: at the airport by 07:40, 17 minutes with traffic, 10-minute buffer.
    expect(flight!.plan_item_id).toBe(world.items.flight);
    expect(local(flight!.leave_at)).toBe('07:10');
    expect(flight!.legs[0]).toMatchObject({ source: 'mapbox', traffic: true, minutes: 17 });
    expect(requests.some((url) => url.includes('depart_at='))).toBe(true);
    const readiness = await world.q<{ user_id: string; state: string }>(
      'SELECT user_id, state FROM readiness WHERE leave_by_id = $1',
      [trek!.id],
    );
    expect(readiness).toHaveLength(4);
    expect(readiness.every((row) => row.state === 'not_up')).toBe(true);
    expect((await timers(trek!.id)).map((timer) => timer.slot)).toEqual([
      'traffic_3h',
      'traffic_45m',
      'window',
      'alarm',
      't0',
    ]);
  });

  it('changes nothing when nothing moved', async () => {
    const before = await changedEvents();
    const result = await recomputeLeaveBys(world.harness.pool, world.tripId, router, NOW);
    expect(result).toEqual({ changed: 0, cancelled: 0 });
    expect(await changedEvents()).toBe(before);
  });

  it('re-arms each timer exactly once when the pickup moves', async () => {
    await world.q("UPDATE bookings SET starts_at = '2026-10-14T19:00:00Z' WHERE id = $1", [
      world.transferBookingId,
    ]);
    const before = await changedEvents();
    const result = await recomputeLeaveBys(world.harness.pool, world.tripId, router, NOW);
    expect(result.changed).toBe(1);
    expect(await changedEvents()).toBe(before + 1);
    const [trek] = await leaveBys();
    expect(local(trek!.leave_at)).toBe('02:50');
    const armed = await timers(trek!.id);
    expect(armed).toHaveLength(5);
    expect(local(armed[3]!.due_at)).toBe('02:40');
  });

  it('cancels a leave-by whose item left the plan', async () => {
    await world.q('UPDATE plan_items SET starts_at = NULL WHERE id = $1', [world.items.flight]);
    const result = await recomputeLeaveBys(world.harness.pool, world.tripId, router, NOW);
    expect(result).toEqual({ changed: 0, cancelled: 1 });
    const flight = (await leaveBys()).find((row) => row.plan_item_id === world.items.flight);
    expect(flight?.state).toBe('cancelled');
    expect(await timers(flight!.id)).toEqual([]);
  });
});

describe('leaveby.schedule', () => {
  let trekId: string;
  const [maya, rin, dev, alex] = [0, 1, 2, 3];

  beforeAll(async () => {
    trekId = (await leaveBys())[0]!.id;
    // Maya and Rin are up; Dev's phone confirmed its alarm; Alex snoozed twice.
    await world.q(
      "UPDATE readiness SET state = 'up', source = 'app' WHERE leave_by_id = $1 AND user_id = ANY($2)",
      [trekId, [world.members[maya], world.members[rin]]],
    );
    await world.q('UPDATE readiness SET snooze_count = 2 WHERE leave_by_id = $1 AND user_id = $2', [
      trekId,
      world.members[alex],
    ]);
    const [device] = await world.q<{ id: string }>(
      `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
       VALUES (uuidv7(), $1, 'ios', '1.0.0', 'en', $2) RETURNING id`,
      [world.members[dev], TRIP_TZ],
    );
    await world.q(
      `INSERT INTO alarms (user_id, device_id, leave_by_id, trip_id, fire_at, state)
       VALUES ($1, $2, $3, $4, '2026-10-14T18:40:00Z', 'scheduled')`,
      [world.members[dev], device!.id, trekId, world.tripId],
    );
  });

  const fire = (slot: string, at: string) =>
    runLeaveByTimer(
      world.harness.pool,
      {
        scheduled_event_id: '0199a0f2-7c1e-7d4b-9a53-2f3c1d0e9b11',
        ref_id: trekId,
        slot,
        due_at: at,
        data: {},
      },
      router,
      new Date(at),
    );

  it('opens the window and refreshes the day bundle', async () => {
    expect(await fire('window', '2026-10-14T18:20:00Z')).toEqual({ outcome: 'window' });
    expect((await leaveBys())[0]!.state).toBe('window');
    const jobs = await world.q<{ data: { local_date: string } }>(
      "SELECT data FROM pgboss.job WHERE name = 'daybundle.build'",
    );
    expect(jobs.map((job) => job.data.local_date)).toContain('2026-10-15');
  });

  it('sends the remote alarm only to sleepers whose phone never confirmed one', async () => {
    expect(await fire('alarm', '2026-10-14T18:40:00Z')).toEqual({ outcome: 'alarm:1' });
    const [due] = await world.q<{ payload: { user_ids: string[] } }>(
      "SELECT payload FROM domain_events WHERE type = 'leave_by.alarm_due' AND aggregate_id = $1",
      [trekId],
    );
    expect(due!.payload.user_ids).toEqual([world.members[alex]]);
  });

  it('knocks for each sleeper once at T0', async () => {
    expect(await fire('t0', '2026-10-14T18:50:00Z')).toEqual({ outcome: 't0:2' });
    expect(await fire('t0', '2026-10-14T18:50:00Z')).toEqual({ outcome: 'gone' });
    const knocks = await world.q<{ payload: { user_id: string; reason: string } }>(
      "SELECT payload FROM domain_events WHERE type = 'leave_by.knocked' AND aggregate_id = $1",
      [trekId],
    );
    expect(knocks.map((knock) => knock.payload.user_id).sort()).toEqual(
      [world.members[dev], world.members[alex]].sort(),
    );
    expect(
      knocks.find((knock) => knock.payload.user_id === world.members[alex])?.payload.reason,
    ).toBe('snooze');
    expect((await leaveBys())[0]!.state).toBe('departed');
  });
});

describe("the day's guide on a trip with two stops", () => {
  // The trip runs 12 to 19 October: two nights at the first stop, then five at the second.
  const FIRST_STOP_DAY = '2026-10-13';
  const SECOND_STOP_DAY = '2026-10-15';

  const perCity = (on: boolean) =>
    world.q(
      `INSERT INTO ops.ops_config (key, value, is_public) VALUES ('guides.per_city', $1::jsonb, false)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(on)],
    );

  /** The guide of each day, of the quests of the later day, and on a leave-by of that day. */
  const guides = () =>
    withSystem(world.harness.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `SELECT id FROM leave_bys
          WHERE trip_id = $1 AND (starts_at AT TIME ZONE tz)::date = $2::date LIMIT 1`,
        [world.tripId, SECOND_STOP_DAY],
      );
      const snapshot = await leaveByLoader({
        tx,
        refId: rows[0]?.id ?? '',
        now: NOW,
        render: () => Promise.resolve(''),
      });
      const attributes = (await snapshot?.attributes('en')) as { guide?: string } | undefined;
      return {
        firstStop: (await dayGuide(tx, world.tripId, FIRST_STOP_DAY))?.slug,
        secondStop: (await dayGuide(tx, world.tripId, SECOND_STOP_DAY))?.slug,
        quests: (await questTrip(tx, world.tripId, SECOND_STOP_DAY))?.guide_slug,
        leaveBy: attributes?.guide,
      };
    });

  beforeAll(async () => {
    await recomputeLeaveBys(world.harness.pool, world.tripId, router, NOW);
    const [own] = await world.q<{ id: string }>(
      "INSERT INTO guides (slug, name, colour) VALUES ('chava', 'Chà Vá', 'orange') RETURNING id",
    );
    await world.q(
      `INSERT INTO guides (slug, name, colour, accent, critter_key)
       VALUES ('ngua', 'Ngựa', 'pink', '#ff8fbf', 'cp-006')`,
    );
    const [next] = await world.q<{ id: string }>(
      `INSERT INTO destinations (slug, name, country, coverage, currency, tz, critter_key)
       VALUES ('ubud-two-stops', 'Ubud', 'ID', 'guest', 'IDR', $1, 'cp-006') RETURNING id`,
      [TRIP_TZ],
    );
    await world.q('UPDATE trips SET guide_id = $2 WHERE id = $1', [world.tripId, own!.id]);
    await world.q(
      `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
       SELECT t.id, t.crew_id, s.position, s.destination_id, s.nights
         FROM trips t,
              (VALUES (1, t.destination_id, 2), (2, $2::uuid, 5)) AS s(position, destination_id, nights)
        WHERE t.id = $1`,
      [world.tripId, next!.id],
    );
  }, 120_000);

  it("gives a later stop's day its own guide where guides go by city", async () => {
    await perCity(true);
    expect(await guides()).toEqual({
      firstStop: 'chava',
      secondStop: 'ngua',
      quests: 'ngua',
      leaveBy: 'ngua',
    });
  });

  it("keeps the trip's guide while guides do not go by city, and on a one-stop trip", async () => {
    const own = { firstStop: 'chava', secondStop: 'chava', quests: 'chava', leaveBy: 'chava' };
    await perCity(false);
    expect(await guides()).toEqual(own);
    await perCity(true);
    await world.q('DELETE FROM trip_stops WHERE trip_id = $1', [world.tripId]);
    expect(await guides()).toEqual(own);
  });
});
