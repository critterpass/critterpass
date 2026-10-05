/**
 * Name search over a destination that runs on machine picks, against real Postgres: the picked
 * place comes before look-alikes of the same name, a villa listed as a sight, a hotel and a museum
 * answers once as the pick, and each row says its area and whether it is recommended.
 */
import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { searchPlaces, type PlaceSearchResultItem } from '../../src/places/search';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let daLat: string;

interface SeedPoi {
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly address?: string;
  readonly pickRank?: number;
  readonly sourceIds?: Record<string, string>;
}

async function seed(poi: SeedPoi): Promise<void> {
  await pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng, address, pick_rank, pick_source,
                       source_ids, confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0.9)`,
    [
      daLat,
      poi.name,
      poi.category,
      poi.lat,
      poi.lng,
      poi.address ?? null,
      poi.pickRank ?? null,
      poi.pickRank === undefined ? null : 'named',
      JSON.stringify(poi.sourceIds ?? { overture: poi.name }),
    ],
  );
}

async function search(q: string): Promise<readonly PlaceSearchResultItem[]> {
  const client = await pool.connect();
  try {
    return await searchPlaces(client, { q, destinationId: daLat });
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz, place_bounds) VALUES
       ('vn-da-lat', 'Đà Lạt', 'live', 'Asia/Ho_Chi_Minh',
        ST_MakeEnvelope(108.35, 11.85, 108.55, 12.02, 4326)::geography)
     RETURNING id`,
  );
  daLat = rows[0]!.id;
  // The hotel listing is the best text match and both sources list it.
  await seed({
    name: 'The Crazy House',
    category: 'stay',
    lat: 11.9348,
    lng: 108.4308,
    sourceIds: { fsq_os: 'f-1', overture: 'o-1' },
  });
  await seed({ name: 'Hang Nga Crazy House', category: 'museum', lat: 11.9346, lng: 108.4306 });
  await seed({
    name: 'Biệt Thự Hằng Nga - Crazy House Đà Lạt',
    category: 'other',
    lat: 11.9347,
    lng: 108.4307,
    address: '3 Huỳnh Thúc Kháng, Phường 4, Đà Lạt',
    pickRank: 1,
  });
  await seed({
    name: 'Crazy House Coffee',
    category: 'food',
    lat: 11.9447,
    lng: 108.4407,
    address: '12 Trần Phú, Hòa Bình, Đà Lạt',
    sourceIds: { fsq_os: 'f-2', overture: 'o-2' },
  });
  await seed({ name: 'Maze Bar', category: 'nightlife', lat: 11.9421, lng: 108.4372, pickRank: 7 });
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('name search where the guide runs on machine picks', () => {
  it('answers the villa once, as the pick, before a look-alike of the same name', async () => {
    const results = await search('Crazy House');
    expect(results.map((item) => item.name)).toEqual([
      'Biệt Thự Hằng Nga - Crazy House Đà Lạt',
      'Crazy House Coffee',
    ]);
    expect(results.map((item) => item.recommended)).toEqual([true, false]);
  });

  it('says the area a row is in, never the destination itself', async () => {
    const results = await search('Crazy House');
    expect(results.map((item) => item.area)).toEqual([null, 'Hòa Bình']);
  });

  it('still finds a place nobody recommends by its name', async () => {
    const results = await search('Crazy House Coffee');
    expect(results[0]).toMatchObject({ name: 'Crazy House Coffee', recommended: false });
  });
});
