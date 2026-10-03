/**
 * `backfillPlaceBounds` against real Postgres: the geofence wins, then given bounds, then the
 * Overture locality point (the divisions read is a network call, so the lookup is replaced here
 * with a recorded answer); a set value is never overwritten, and an unmatched destination is
 * reported, not guessed. `loadPlaceBounds` reads the box back.
 */
import { randomUUID } from 'node:crypto';

import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DivisionTarget } from '../../src/places/division-points';
import { backfillPlaceBounds, loadPlaceBounds } from '../../src/places/place-bounds';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;

async function destination(slug: string, name: string, geofence?: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz, geofence)
     VALUES ($1, $2, 'live', 'Asia/Ho_Chi_Minh', ST_GeogFromText($3)) RETURNING id`,
    [slug, name, geofence ?? null],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);

  const lead = randomUUID();
  await pool.query(
    "INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', 'Lead')",
    [lead],
  );
  const { rows: release } = await pool.query<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
       item_count, approved_by, approved_at, published_at)
     VALUES ('sets', 1, 'bounds-test', 'Test', 'published', 'publish', repeat('0', 64), '{}', 0, $1, now(), now())
     RETURNING id`,
    [lead],
  );
  const { rows: set } = await pool.query<{ id: string }>(
    `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
       hero_critter_key, month_hints, release_id)
     VALUES ('vn', 'Vietnam', 'VN', 1, 'Asia/Ho_Chi_Minh', 'VND', '{vi}', 'live', 'cp-1', '[]', $1)
     RETURNING id`,
    [release[0]!.id],
  );
  await destination(
    'da-nang',
    'Đà Nẵng',
    'MULTIPOLYGON(((107.95 15.84, 108.36 15.84, 108.36 16.21, 107.95 16.21, 107.95 15.84)))',
  );
  const hoiAn = await destination('vn-hoi-an', 'Hội An');
  const mekong = await destination('vn-mekong', 'Mekong');
  await destination('kyoto', 'Kyoto');
  await destination('no-set', 'Nowhere');
  await pool.query('UPDATE destinations SET critter_set_id = $1 WHERE id = ANY($2::uuid[])', [
    set[0]!.id,
    [hoiAn, mekong],
  ]);
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('backfillPlaceBounds', () => {
  it('fills from the geofence, given bounds and the locality point, and reports the rest', async () => {
    const asked: DivisionTarget[] = [];
    const result = await backfillPlaceBounds(
      pool,
      new Map([['kyoto', { minLat: 34.85, maxLat: 35.15, minLng: 135.6, maxLng: 135.9 }]]),
      (targets) => {
        asked.push(...targets);
        return Promise.resolve(
          new Map([
            ['vn-hoi-an', { lat: 15.88, lng: 108.335, population: 98_000, subtype: 'locality' }],
          ]),
        );
      },
    );

    expect(asked).toEqual([
      { key: 'vn-hoi-an', name: 'Hội An', country: 'VN' },
      { key: 'vn-mekong', name: 'Mekong', country: 'VN' },
    ]);
    expect(result.filled).toEqual([
      { slug: 'da-nang', source: 'geofence' },
      { slug: 'kyoto', source: 'given' },
      { slug: 'vn-hoi-an', source: 'locality' },
    ]);
    expect(result.unresolved).toEqual(['no-set', 'vn-mekong']);

    const bounds = await loadPlaceBounds(pool);
    expect(bounds.map((row) => row.slug)).toEqual(['da-nang', 'kyoto', 'vn-hoi-an']);
    expect(bounds[0]?.bbox).toEqual({
      minLat: 15.84,
      maxLat: 16.21,
      minLng: 107.95,
      maxLng: 108.36,
    });
    const hoiAn = bounds[2]!.bbox;
    expect((hoiAn.minLat + hoiAn.maxLat) / 2).toBeCloseTo(15.88, 3);
    expect(hoiAn.maxLat - hoiAn.minLat).toBeGreaterThan(0.08);
  });

  it('never overwrites a set value', async () => {
    await pool.query(
      "UPDATE destinations SET geofence = ST_GeogFromText('MULTIPOLYGON(((0 0, 1 0, 1 1, 0 1, 0 0)))') WHERE slug = 'kyoto'",
    );
    const result = await backfillPlaceBounds(pool, new Map(), () => Promise.resolve(new Map()));
    expect(result.filled).toEqual([]);
    const [kyoto] = await loadPlaceBounds(pool, ['kyoto']);
    expect(kyoto?.bbox.minLng).toBe(135.6);
  });
});
