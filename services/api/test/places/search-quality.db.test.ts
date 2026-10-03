/**
 * Quality-aware place search against real Postgres: low-confidence open-data rows rank after real
 * places for a query and stay out of a no-query browse, editorial and FSQ-listed places come first,
 * and a destination also finds another destination's places inside its place box.
 */
import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { searchPlaces, type PlaceSearchFilters } from '../../src/places/search';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let hoiAn: string;
let daNang: string;

interface SeedPoi {
  readonly name: string;
  readonly category?: string;
  readonly curation?: 'auto' | 'editorial';
  readonly sourceIds: Record<string, string>;
  readonly confidence: number | null;
  readonly destination?: 'hoi-an' | 'da-nang';
  readonly lat?: number;
}

async function seed(poi: SeedPoi): Promise<void> {
  await pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng, curation, source_ids, confidence)
     VALUES ($1, $2, $3, $4, 108.33, $5, $6, $7)`,
    [
      poi.destination === 'da-nang' ? daNang : hoiAn,
      poi.name,
      poi.category ?? 'food',
      poi.lat ?? 15.877,
      poi.curation ?? 'auto',
      JSON.stringify(poi.sourceIds),
      poi.confidence,
    ],
  );
}

async function names(filters: PlaceSearchFilters): Promise<string[]> {
  const client = await pool.connect();
  try {
    return (await searchPlaces(client, filters)).map((item) => item.name);
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  // Hội An's box lies inside Đà Nẵng's, as on staging.
  const { rows } = await pool.query<{ slug: string; id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz, place_bounds) VALUES
       ('vn-hoi-an', 'Hội An', 'live', 'Asia/Ho_Chi_Minh',
        ST_MakeEnvelope(108.28, 15.85, 108.42, 15.92, 4326)::geography),
       ('da-nang', 'Đà Nẵng', 'live', 'Asia/Ho_Chi_Minh',
        ST_MakeEnvelope(107.95, 15.84, 108.36, 16.21, 4326)::geography)
     RETURNING slug, id`,
  );
  hoiAn = rows.find((row) => row.slug === 'vn-hoi-an')!.id;
  daNang = rows.find((row) => row.slug === 'da-nang')!.id;

  await seed({ name: 'Coffee Review Page', sourceIds: { overture: 'o-1' }, confidence: 0.12 });
  await seed({ name: 'Coffee Corner', sourceIds: { overture: 'o-2' }, confidence: 0.9 });
  await seed({
    name: 'Coffee House',
    sourceIds: { fsq_os: 'f-1', overture: 'o-3' },
    confidence: 0.4,
  });
  await seed({
    name: 'Coffee Lab',
    curation: 'editorial',
    sourceIds: { overture: 'o-4' },
    confidence: 0.2,
  });
  await seed({
    name: 'Old Town Coffee',
    destination: 'da-nang',
    sourceIds: { overture: 'o-5' },
    confidence: 0.8,
  });
  await seed({
    name: 'Mỹ Khê Coffee',
    destination: 'da-nang',
    lat: 16.06,
    sourceIds: { overture: 'o-6' },
    confidence: 0.95,
  });
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('place search quality', () => {
  it('ranks editorial first and low-confidence open data after every real match', async () => {
    const result = await names({ q: 'coffee', destinationId: hoiAn });
    expect(result[0]).toBe('Coffee Lab');
    expect(result.at(-1)).toBe('Coffee Review Page');
    expect(result).toHaveLength(5);
  });

  it('leaves low-confidence rows out of a no-query browse, best sources first', async () => {
    expect(await names({ destinationId: hoiAn })).toEqual([
      'Coffee Lab',
      'Coffee House',
      'Coffee Corner',
      'Old Town Coffee',
    ]);
  });

  it('leaves them out of a near-me browse too', async () => {
    const result = await names({ destinationId: hoiAn, near: { lat: 15.877, lng: 108.33 } });
    expect(result).not.toContain('Coffee Review Page');
    expect(result).toHaveLength(4);
  });

  it("covers another destination's places inside its box, and only those", async () => {
    expect(await names({ q: 'Old Town', destinationId: hoiAn })).toEqual(['Old Town Coffee']);
    expect(await names({ q: 'Old Town', destinationId: daNang })).toEqual(['Old Town Coffee']);
    expect(await names({ q: 'Mỹ Khê', destinationId: hoiAn })).toEqual([]);
  });
});
