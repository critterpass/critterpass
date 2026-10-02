/**
 * Which places earn a leave-by, against a migrated Postgres with recorded Mapbox routing: an
 * airport picked from place search (a `transit` item at a `transit` place) gets one even at midday
 * with a short drive, while a bus station on the same terms does not.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { recomputeLeaveBys } from '../../src/jobs/trip-day/leaveby-recompute';
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

async function leaveByFor(itemId: string): Promise<{ state: string } | undefined> {
  const rows = await world.q<{ state: string }>(
    'SELECT state FROM leave_bys WHERE trip_id = $1 AND plan_item_id = $2',
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
