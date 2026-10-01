/**
 * A leave-by with no travel leg (a booked flight on a morning with nowhere to set off from) on the
 * lock screen: the activity says where to be and by when, in each phone's language, and counts
 * down to that time; a leave-by with a trip counted keeps saying when to leave.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { eventOf, startLaWorld, type LaWorld } from './la-world';

let world: LaWorld;
let flightLeaveById: string;
let departs: Date;

const TZ = 'Asia/Makassar';
const clock = (at: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(at);
const apsOf = (body: Record<string, unknown>) =>
  body['aps'] as {
    alert: { title: string };
    attributes: { legs: string[] };
    'content-state': { leave_at: number; place_line: string };
  };

beforeAll(async () => {
  world = await startLaWorld();
  const owner = world.trip.members[0]!;
  departs = new Date(world.now.getTime() + 150 * 60_000);
  const [booking] = await world.q<{ id: string }>(
    `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, supplier, traveller_ids)
     VALUES ($1, $2, 'flight', 'Flight', 'crew', 'airline', $3::uuid[]) RETURNING id`,
    [world.trip.tripId, owner, world.trip.members],
  );
  await world.q(
    `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, carrier, flight_no,
       dep_airport, arr_airport, sched_dep_at)
     VALUES ($1, $2, $3, true, '9G', '956', 'SGN', 'DAD', $4)`,
    [booking!.id, world.trip.tripId, owner, departs],
  );
  await world.q('UPDATE plan_items SET booking_id = $2, starts_at = $3 WHERE id = $1', [
    world.trip.items.flight,
    booking!.id,
    departs,
  ]);
  const [leaveBy] = await world.q<{ id: string }>(
    `INSERT INTO leave_bys (trip_id, plan_item_id, plan_item_stable_id, title, local_date,
       starts_at, leave_at, tz, legs, participant_ids, state)
     VALUES ($1, $2, $2, '9G 956 · SGN → DAD', $3, $4, $5, $6, '[{"kind": "none"}]', $7,
       'scheduled') RETURNING id`,
    [
      world.trip.tripId,
      world.trip.items.flight,
      departs.toISOString().slice(0, 10),
      departs,
      new Date(departs.getTime() - 130 * 60_000),
      TZ,
      world.trip.members.slice(0, 2),
    ],
  );
  flightLeaveById = leaveBy!.id;
  // Rin reads Vietnamese; both phones hold a leave-by push-to-start token already (the world's).
  await world.q("UPDATE devices SET locale = 'vi' WHERE id = $1", [world.devices[1]]);
  await world.q('DELETE FROM la_push_to_start_tokens WHERE device_id <> ALL($1::uuid[])', [
    world.devices.slice(0, 2),
  ]);
  world.drain();
}, 240_000);

afterAll(async () => {
  await world.stop();
});

describe('la.orchestrate leave-by with no trip counted', { timeout: 60_000 }, () => {
  it('says where to be and by when, in each phone’s language, and counts to that time', async () => {
    const beThere = new Date(departs.getTime() - 120 * 60_000);
    expect(await world.orchestrate('leave_by', flightLeaveById)).toMatchObject({ sends: 2 });
    const starts = world.drain().filter((r) => eventOf(r) === 'start');
    expect(starts.map((r) => apsOf(r.body).alert.title).sort()).toEqual(
      [`Be at SGN by ${clock(beThere)}`, `Có mặt ở SGN trước ${clock(beThere)}`].sort(),
    );
    for (const start of starts) {
      const aps = apsOf(start.body);
      expect(aps['content-state']).toMatchObject({
        leave_at: Math.floor(beThere.getTime() / 1000),
        place_line: 'Be at SGN',
      });
      expect(aps.attributes.legs[1]).toBe('SGN');
      expect(aps.attributes.legs).toHaveLength(2);
    }
  });

  it('keeps "leave by" for a leave-by with a trip counted', async () => {
    await world.run();
    const starts = world.drain().filter((r) => eventOf(r) === 'start');
    const titles = starts.map((r) => apsOf(r.body).alert.title);
    expect(
      titles.filter((title) => /^Leave by \d{2}:\d{2} · Mount Batur$/.test(title)),
    ).toHaveLength(1);
    expect(titles.some((title) => title.includes('SGN'))).toBe(false);
    for (const start of starts) {
      expect(apsOf(start.body)['content-state'].place_line).toBe('Mount Batur');
    }
  });
});
