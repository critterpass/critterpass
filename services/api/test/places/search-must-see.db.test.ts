/**
 * Name search on a Đà Nẵng trip, against real Postgres: the editors' must-see sight comes before a
 * hotel that borrows its name, even when the hotel is a machine pick and the better text match
 * ("The Marble Mountain Hotel" for "Marble Mountain"), while a search that names the hotel still
 * finds it first.
 */
import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { searchPlaces } from '../../src/places/search';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let daNang: string;

interface SeedPoi {
  readonly name: string;
  readonly nameLocal?: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly mustSee?: boolean;
  readonly pickRank?: number;
  readonly sourceIds: Record<string, string>;
}

async function seed(poi: SeedPoi): Promise<void> {
  await pool.query(
    `INSERT INTO pois (destination_id, name, name_local, category, lat, lng, curation, editorial,
                       pick_rank, pick_source, source_ids, confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0.9)`,
    [
      daNang,
      poi.name,
      poi.nameLocal ?? null,
      poi.category,
      poi.lat,
      poi.lng,
      poi.mustSee === undefined ? 'auto' : 'editorial',
      JSON.stringify(poi.mustSee === undefined ? {} : { must_see: poi.mustSee }),
      poi.pickRank ?? null,
      poi.pickRank === undefined ? null : 'named',
      JSON.stringify(poi.sourceIds),
    ],
  );
}

async function names(q: string): Promise<readonly string[]> {
  const client = await pool.connect();
  try {
    return (await searchPlaces(client, { q, destinationId: daNang })).map((item) => item.name);
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
       ('vn-da-nang', 'Đà Nẵng', 'live', 'Asia/Ho_Chi_Minh',
        ST_MakeEnvelope(107.9, 15.85, 108.35, 16.2, 4326)::geography)
     RETURNING id`,
  );
  daNang = rows[0]!.id;
  // Both sources list the hotel, and the pick job picked it.
  await seed({
    name: 'The Marble Mountain Hotel',
    category: 'stay',
    lat: 16.0268,
    lng: 108.2487,
    pickRank: 1,
    sourceIds: { fsq_os: 'f-hotel', overture: 'o-hotel' },
  });
  await seed({
    name: 'Marble Mountains',
    nameLocal: 'Ngũ Hành Sơn',
    category: 'nature',
    lat: 16.0029,
    lng: 108.2638,
    mustSee: true,
    sourceIds: { overture: 'o-sight' },
  });
  await seed({
    name: 'Marble Mountains Museum',
    category: 'museum',
    lat: 16.0039,
    lng: 108.266,
    sourceIds: { overture: 'o-museum' },
  });
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('a must-see and the hotel named after it', () => {
  it.each(['Marble Mountains', 'Marble Mountain'])(
    'lists the sight first and the hotel below it for "%s"',
    async (q) => {
      const found = await names(q);
      expect(found[0]).toBe('Marble Mountains');
      expect(found).toContain('The Marble Mountain Hotel');
    },
  );

  it('still puts the hotel first when the search names it', async () => {
    expect((await names('Marble Mountain Hotel'))[0]).toBe('The Marble Mountain Hotel');
  });
});
