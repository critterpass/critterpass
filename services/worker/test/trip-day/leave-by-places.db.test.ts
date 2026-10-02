/**
 * Which places earn a leave-by, against a migrated Postgres with recorded Mapbox routing: an
 * airport picked from place search (a `transit` item at a `transit` place) gets one even at midday
 * with a short drive, while a bus station on the same terms does not. A transfer booked by hand
 * routes to its booking's pickup, placed on one of the destination's own POIs when the pickup text
 * names it, else asked of Mapbox once per pickup text, and left unplaced when nothing fits.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';

import { recomputeLeaveBys } from '../../src/jobs/trip-day/leaveby-recompute';
import { mapboxPickupGeocoder } from '../../src/jobs/trip-day/pickup-placing';
import { NOW, recordedMapboxRouter, startTripDayWorld, type TripDayWorld } from './trip-day-world';

let world: TripDayWorld;
const { router } = recordedMapboxRouter();

async function placedItem(name: string, startsAt: string): Promise<string> {
  const [poi] = await world.q<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, $2, 'transit', -8.7482, 115.1675) RETURNING id`,
    [world.destinationId, name],
  );
  const [item] = await world.q<{ id: string }>(
    `INSERT INTO plan_items (version_id, day_id, trip_id, poi_id, starts_at, tz, category, status)
     SELECT version_id, day_id, trip_id, $2, $3, tz, 'transit', 'confirmed'
       FROM plan_items WHERE id = $1 RETURNING id`,
    [world.items.trek, poi!.id, startsAt],
  );
  return item!.id;
}

interface LeaveByRow {
  state: string;
  legs: { kind: string; minutes: number }[];
}

async function leaveByFor(itemId: string): Promise<LeaveByRow | undefined> {
  const rows = await world.q<LeaveByRow>(
    'SELECT state, legs FROM leave_bys WHERE trip_id = $1 AND plan_item_id = $2',
    [world.tripId, itemId],
  );
  return rows[0];
}

beforeAll(async () => {
  world = await startTripDayWorld();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('leaveby.recompute for places', () => {
  it('gives an airport from place search a leave-by and a bus station none', async () => {
    // 13:00 on the trek day, 17 minutes from the trailhead: neither early nor far.
    const airport = await placedItem(
      'I Gusti Ngurah Rai International Airport',
      '2026-10-15T05:00:00Z',
    );
    const busStation = await placedItem('Terminal Mengwi', '2026-10-15T05:30:00Z');
    await recomputeLeaveBys(world.harness.pool, world.tripId, router, NOW);
    expect(await leaveByFor(airport)).toMatchObject({ state: 'scheduled' });
    expect(await leaveByFor(busStation)).toBeUndefined();
  });
});

/** Mapbox replayed from the recorded Đà Nẵng "hotel lobby" answer (a street, never an address). */
function countingMapbox() {
  const body = readFileSync(
    new URL('./fixtures/mapbox-geocode/v6-forward-hotel-lobby-da-nang.json', import.meta.url),
    'utf8',
  );
  const calls: string[] = [];
  const geocoder = mapboxPickupGeocoder({
    accessToken: 'replay',
    http: {
      fetch: (input) => {
        calls.push(input);
        return Promise.resolve(new Response(body, { status: 200 }));
      },
    },
  });
  return { geocoder, calls };
}

async function handBookedTransfer(location: string, startsAt: string) {
  const [booking] = await world.q<{ id: string }>(
    `INSERT INTO bookings (trip_id, owner_id, type, title, starts_at, tz, location, source,
       visibility)
     VALUES ($1, $2, 'transfer', 'Airport run', $3, 'Asia/Makassar', $4, 'manual', 'crew')
     RETURNING id`,
    [world.tripId, world.members[0], startsAt, location],
  );
  const [item] = await world.q<{ id: string }>(
    `INSERT INTO plan_items (version_id, day_id, trip_id, starts_at, tz, category, booking_id, notes,
       status, locked_reason, created_by_kind)
     SELECT version_id, day_id, trip_id, $2, tz, 'transfer', $3, 'Airport run', 'confirmed',
            'booking', 'user'
       FROM plan_items WHERE id = $1 RETURNING id`,
    [world.items.trek, startsAt, booking!.id],
  );
  return { bookingId: booking!.id, itemId: item!.id };
}

async function pickupPoint(bookingId: string): Promise<Record<string, unknown> | undefined> {
  const [row] = await world.q<{ point: Record<string, unknown> | null }>(
    "SELECT details -> 'pickup_point' AS point FROM bookings WHERE id = $1",
    [bookingId],
  );
  return row?.point ?? undefined;
}

describe('leaveby.recompute for a transfer booked by hand', () => {
  const mapbox = countingMapbox();
  let villa: { bookingId: string; itemId: string };
  let lobby: { bookingId: string; itemId: string };

  beforeAll(async () => {
    await world.q(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Alaya Resort Ubud', 'stay', -8.5100, 115.2640)`,
      [world.destinationId],
    );
    villa = await handBookedTransfer('Pickup at Alaya Resort Ubud lobby', '2026-10-15T06:00:00Z');
    lobby = await handBookedTransfer('Hotel lobby', '2026-10-15T07:00:00Z');
  });

  it("routes to a pickup the destination's own places name, without asking Mapbox", async () => {
    await recomputeLeaveBys(world.harness.pool, world.tripId, router, NOW, mapbox.geocoder);
    expect(await pickupPoint(villa.bookingId)).toMatchObject({
      from_text: 'Pickup at Alaya Resort Ubud lobby',
      source: 'poi',
      label: 'Alaya Resort Ubud',
    });
    expect((await leaveByFor(villa.itemId))?.legs[0]).toMatchObject({ kind: 'route', minutes: 17 });
    // "Hotel lobby" names no place of ours; Mapbox finds only a street, so it stays unplaced.
    expect(mapbox.calls).toHaveLength(1);
    expect(await pickupPoint(lobby.bookingId)).toEqual({
      from_text: 'Hotel lobby',
      unresolved: true,
    });
    expect((await leaveByFor(lobby.itemId))?.legs[0]).toMatchObject({ kind: 'none' });
  });

  it('never asks Mapbox twice for the same pickup text', async () => {
    await recomputeLeaveBys(world.harness.pool, world.tripId, router, NOW, mapbox.geocoder);
    expect(mapbox.calls).toHaveLength(1);
  });

  it('places the pickup again once the traveller changes its text', async () => {
    await world.q("UPDATE bookings SET location = 'Lobby' WHERE id = $1", [villa.bookingId]);
    await recomputeLeaveBys(world.harness.pool, world.tripId, router, NOW, mapbox.geocoder);
    expect(mapbox.calls).toHaveLength(2);
    expect(await pickupPoint(villa.bookingId)).toEqual({ from_text: 'Lobby', unresolved: true });
    expect((await leaveByFor(villa.itemId))?.legs[0]).toMatchObject({ kind: 'none' });
  });
});
