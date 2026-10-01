/**
 * A flight in the wallet, from the booking to its leave-by, against a migrated Postgres: the draft
 * takes the flight as an anchored item for its traveller alone (writing it again changes nothing,
 * and the pickup booking the trek already carries gets no item of its own), and once that plan is
 * the trip's plan the recompute gives the traveller a leave-by two hours and the buffer before
 * departure, with no leg to route: nothing on the plan says where they set off from.
 */
import { withSystem, writeBookedPlanItems } from '@cp/db';
import { toLocalWallTime } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { recomputeLeaveBys } from '../../src/jobs/trip-day/leaveby-recompute';
import {
  NOW,
  recordedMapboxRouter,
  startTripDayWorld,
  TRIP_TZ,
  type TripDayWorld,
} from './trip-day-world';

let world: TripDayWorld;
const { router, requests } = recordedMapboxRouter();

beforeAll(async () => {
  world = await startTripDayWorld();
}, 240_000);

afterAll(async () => {
  await world.stop();
});

describe('a booked flight', () => {
  it('sits on the draft as an anchored item and gets a leave-by once the plan is current', async () => {
    const rin = world.members[1]!;
    const [booking] = await world.q<{ id: string }>(
      `INSERT INTO bookings (trip_id, owner_id, type, title, tz, traveller_ids, source, visibility,
         flight_crew_visible)
       VALUES ($1, $2, 'flight', 'Rin flies ahead', $3, ARRAY[$2::uuid], 'manual', 'personal', true)
       RETURNING id`,
      [world.tripId, rin, TRIP_TZ],
    );
    // 07:05 in Bali on 15 October.
    await world.q(
      `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, segment_no, carrier,
         flight_no, dep_airport, arr_airport, sched_dep_at, sched_arr_at)
       VALUES ($1, $2, $3, true, 1, 'GA', '401', 'DPS', 'CGK', '2026-10-14T23:05:00Z',
         '2026-10-15T01:00:00Z')`,
      [booking!.id, world.tripId, rin],
    );
    const [draft] = await world.q<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status)
       VALUES ($1, 'organiser', 'draft') RETURNING id`,
      [world.tripId],
    );
    const [day] = await world.q<{ id: string }>(
      `INSERT INTO plan_days (version_id, trip_id, day_no, date)
       VALUES ($1, $2, 4, '2026-10-15') RETURNING id`,
      [draft!.id, world.tripId],
    );
    // The trek at 04:30, carrying the crew's pickup booking as it does on the trip's plan.
    await world.q(
      `INSERT INTO plan_items (version_id, day_id, trip_id, starts_at, tz, category, booking_id)
       VALUES ($1, $2, $3, '2026-10-14T20:30:00Z', $4, 'activity', $5)`,
      [draft!.id, day!.id, world.tripId, TRIP_TZ, world.transferBookingId],
    );
    const write = () =>
      withSystem(world.harness.pool, (tx) => writeBookedPlanItems(tx, world.tripId, draft!.id));
    expect(await write()).toBe(1);
    expect(await write()).toBe(0);
    const items = await world.q<{ id: string; category: string; attendee_ids: string[] }>(
      'SELECT id, category, attendee_ids FROM plan_items WHERE version_id = $1 AND booking_id = $2',
      [draft!.id, booking!.id],
    );
    const pickups = await world.q(
      'SELECT 1 FROM plan_items WHERE version_id = $1 AND booking_id = $2',
      [draft!.id, world.transferBookingId],
    );
    expect(pickups).toHaveLength(1);
    expect(items).toMatchObject([{ category: 'flight', attendee_ids: [rin] }]);

    // The draft becomes the trip's plan.
    await world.q(
      "UPDATE itinerary_versions SET visibility = 'crew', status = 'current' WHERE id = $1",
      [draft!.id],
    );
    await world.q('UPDATE trips SET current_version_id = $2 WHERE id = $1', [
      world.tripId,
      draft!.id,
    ]);
    const result = await recomputeLeaveBys(world.harness.pool, world.tripId, router, NOW);
    expect(result).toEqual({ changed: 2, cancelled: 0 });
    const [leaveBy] = await world.q<{
      id: string;
      plan_item_id: string;
      title: string;
      leave_at: Date;
      participant_ids: string[];
      legs: { kind: string; minutes: number; estimate: boolean }[];
    }>(
      `SELECT id, plan_item_id, title, leave_at, participant_ids, legs FROM leave_bys
        WHERE trip_id = $1 AND plan_item_id = $2`,
      [world.tripId, items[0]!.id],
    );
    expect(leaveBy).toMatchObject({
      plan_item_id: items[0]!.id,
      title: 'GA 401 · DPS → CGK',
      participant_ids: [rin],
    });
    // At the airport two hours before 07:05, less the 10-minute buffer.
    expect(toLocalWallTime(leaveBy!.leave_at, TRIP_TZ).time.slice(0, 5)).toBe('04:55');
    expect(leaveBy!.legs[0]).toMatchObject({ kind: 'none', minutes: 0, estimate: true });
    expect(requests).toHaveLength(0);
    const readiness = await world.q<{ user_id: string }>(
      'SELECT user_id FROM readiness WHERE leave_by_id = $1',
      [leaveBy!.id],
    );
    expect(readiness).toEqual([{ user_id: rin }]);
  });
});
