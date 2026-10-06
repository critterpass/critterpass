/**
 * The readers that follow a trip's areas: a place in a stop's city or in a day's area belongs to
 * the trip, one outside every area does not; the trip's one destination answers as before; each
 * day names its area; and a new stop or day area that holds few places is queued for the ingest.
 */
import { randomUUID } from 'node:crypto';

import { dayArea, withSystem, type AppendedDomainEvent } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { poiForTrip } from '../../../src/commands/ideas';
import { onDemandIngestHook } from '../../../src/places/on-demand-ingest';
import {
  buildSetupCrew,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
const place = { kyoto: '', osaka: '', nara: '', tokyo: '' };
const poi = { kyoto: '', osaka: '', nara: '', tokyo: '' };
let versionId: string;

const inside = (poiId: string) =>
  withSystem(harness.pool, (tx) => poiForTrip(tx, crew.tripId, poiId)).then(
    () => 'inside',
    (error: { detail?: { reason?: string } }) => error.detail?.reason ?? 'error',
  );

beforeAll(async () => {
  harness = await startSetupHarness();
  crew = await buildSetupCrew(harness, 1);
  await withSystem(harness.pool, async (tx) => {
    const { rows: trip } = await tx.query<{ destination_id: string; crew_id: string }>(
      'SELECT destination_id, crew_id FROM trips WHERE id = $1',
      [crew.tripId],
    );
    place.kyoto = trip[0]!.destination_id;
    const destination = async (name: string, coverage: string) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO destinations (slug, name, coverage, tz) VALUES ($1, $2, $3, 'Asia/Tokyo')
         RETURNING id`,
        [`${name.toLowerCase()}-${randomUUID().slice(0, 8)}`, name, coverage],
      );
      return rows[0]!.id;
    };
    place.osaka = await destination('Osaka', 'guest');
    place.nara = await destination('Nara', 'area');
    place.tokyo = await destination('Tokyo', 'guest');
    for (const key of ['kyoto', 'osaka', 'nara', 'tokyo'] as const) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng)
         VALUES ($1, $2, 'temple_shrine', 35.0, 135.7) RETURNING id`,
        [place[key], `A temple in ${key}`],
      );
      poi[key] = rows[0]!.id;
    }
    const { rows: version } = await tx.query<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current')
       RETURNING id`,
      [crew.tripId],
    );
    versionId = version[0]!.id;
    for (const dayNo of [1, 2, 3, 4]) {
      await tx.query('INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, $3)', [
        versionId,
        crew.tripId,
        dayNo,
      ]);
    }
    await tx.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [
      crew.tripId,
      versionId,
    ]);
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe("readers of a trip's areas", () => {
  it('reads a one-stop trip as its destination alone', async () => {
    expect(await inside(poi.kyoto)).toBe('inside');
    for (const key of ['osaka', 'nara', 'tokyo'] as const) {
      expect(await inside(poi[key]), key).toBe('outside_destination');
    }
  });

  it("takes a place in a stop's city and in a day's area, and nothing outside them", async () => {
    await withSystem(harness.pool, async (tx) => {
      await tx.query(
        `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
         SELECT id, crew_id, s.position, s.destination_id, 2
           FROM trips, (VALUES (1, $2::uuid), (2, $3::uuid)) AS s(position, destination_id)
          WHERE id = $1`,
        [crew.tripId, place.kyoto, place.osaka],
      );
      await tx.query(
        'UPDATE plan_days SET destination_id = $2 WHERE version_id = $1 AND day_no = 2',
        [versionId, place.nara],
      );
    });
    expect(await inside(poi.kyoto)).toBe('inside');
    expect(await inside(poi.osaka)).toBe('inside');
    expect(await inside(poi.nara)).toBe('inside');
    expect(await inside(poi.tokyo)).toBe('outside_destination');
  });

  it('names the area of a day trip day, and the stop city of the others', async () => {
    const days = await withSystem(harness.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string; day_no: number }>(
        'SELECT id, day_no FROM plan_days WHERE version_id = $1 ORDER BY day_no',
        [versionId],
      );
      const areas = [];
      for (const row of rows) areas.push((await dayArea(tx, crew.tripId, row.id))?.areaId);
      return areas;
    });
    expect(days).toEqual([place.kyoto, place.nara, place.osaka, place.osaka]);
  });

  it('queues the ingest for a new area that holds few places', async () => {
    const event: AppendedDomainEvent = {
      id: randomUUID(),
      type: 'trip.areas_changed',
      tripId: crew.tripId,
      crewId: crew.crewId,
    };
    await withSystem(harness.pool, (tx) => onDemandIngestHook(tx, event));
    const { rows } = await harness.pool.query<{ slug: string }>(
      "SELECT data->>'slug' AS slug FROM pgboss.job WHERE name = 'places.ingest' ORDER BY 1",
    );
    const slugs = rows.map((row) => row.slug);
    expect(slugs.some((slug) => slug.startsWith('osaka-'))).toBe(true);
    expect(slugs.some((slug) => slug.startsWith('nara-'))).toBe(true);
    expect(slugs.some((slug) => slug.startsWith('tokyo-'))).toBe(false);
  });
});
