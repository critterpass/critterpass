import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import {
  idsByTable,
  startStreamHarness,
  STREAM_ACTORS,
  totalRows,
  type StreamHarness,
} from '../helpers/stream-harness';

let harness: StreamHarness;
let destinationId: string;
let otherDestinationId: string;
let activePoiId: string;
let closedPoiId: string;
let regionId: string;

const SERVER_ONLY_POI_COLUMNS = ['fts', 'location', 'geofence', 'source_ids', 'merged_into_id'];

beforeAll(async () => {
  harness = await startStreamHarness();
  const { fixture } = harness;
  const seeded = await withSystem(harness.db.pool, async (tx) => {
    const destination = await tx.query<{ id: string }>(
      "SELECT id FROM destinations WHERE slug = 'matrix-probe-destination'",
    );
    const dest = destination.rows[0]!.id;
    const other = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ('stream-other', 'Other') RETURNING id",
    );
    const poi = await tx.query<{ id: string }>(
      "SELECT id FROM pois WHERE destination_id = $1 AND name = 'Matrix Probe POI'",
      [dest],
    );
    const active = poi.rows[0]!.id;
    await tx.query("UPDATE pois SET curation = 'editorial' WHERE id = $1", [active]);
    const insertPoi = async (
      destination: string,
      name: string,
      status: string,
      curation: 'editorial' | 'auto' = 'editorial',
    ) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, status, curation)
         VALUES ($1, $2, 'other', 1, 1, $3, $4) RETURNING id`,
        [destination, name, status, curation],
      );
      return rows[0]!.id;
    };
    const closed = await insertPoi(dest, 'Closed POI', 'closed');
    await insertPoi(dest, 'Hidden POI', 'hidden');
    // An open-data import row nobody has curated stays server-side, searchable over HTTP only.
    await insertPoi(dest, 'Imported POI', 'active', 'auto');
    const duplicate = await insertPoi(dest, 'Duplicate POI', 'active');
    await tx.query('UPDATE pois SET merged_into_id = $1 WHERE id = $2', [active, duplicate]);
    await insertPoi(other.rows[0]!.id, 'Elsewhere POI', 'active');
    const region = await tx.query<{ id: string }>(
      'SELECT id FROM map_regions WHERE destination_id = $1',
      [dest],
    );
    await tx.query('UPDATE trips SET destination_id = $1 WHERE id = $2', [dest, fixture.tripId]);
    return {
      dest,
      other: other.rows[0]!.id,
      active,
      closed,
      region: region.rows[0]!.id,
    };
  });
  destinationId = seeded.dest;
  otherDestinationId = seeded.other;
  activePoiId = seeded.active;
  closedPoiId = seeded.closed;
  regionId = seeded.region;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('trip_pack stream', () => {
  const params = (): Record<string, string> => ({ trip_id: harness.fixture.tripId });

  it.each(['member', 'organiser'] as const)(
    "syncs the trip destination's visible editorial POIs and map region to %s",
    async (actor) => {
      const ids = idsByTable(await harness.rows('trip_pack', actor, params()));
      expect(ids['pois']).toEqual([activePoiId, closedPoiId].sort());
      expect(ids['map_regions']).toEqual([regionId]);
    },
  );

  it.each(['outsider', 'exMember', 'anonymous'] as const)(
    'syncs zero rows to %s',
    async (actor) => {
      expect(totalRows(await harness.rows('trip_pack', actor, params()))).toBe(0);
    },
  );

  it('keeps search vectors, PostGIS shapes and provider ids server-side', async () => {
    const rows = await harness.rows('trip_pack', 'member', params());
    for (const row of rows.get('pois') ?? []) {
      for (const column of SERVER_ONLY_POI_COLUMNS) expect(row).not.toHaveProperty(column);
    }
  });
});

describe('explore stream', () => {
  it.each(STREAM_ACTORS)("syncs any destination's visible editorial POIs to %s", async (actor) => {
    const ids = idsByTable(await harness.rows('explore', actor, { destination_id: destinationId }));
    expect(ids['pois']).toEqual([activePoiId, closedPoiId].sort());
  });

  it('is scoped to the requested destination', async () => {
    const ids = idsByTable(
      await harness.rows('explore', 'member', { destination_id: otherDestinationId }),
    );
    expect(ids['pois']).toHaveLength(1);
    expect(ids['pois']).not.toContain(activePoiId);
  });

  it('syncs nothing without a destination_id', async () => {
    expect(totalRows(await harness.rows('explore', 'member'))).toBe(0);
  });
});
