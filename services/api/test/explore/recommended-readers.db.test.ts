/**
 * The explore and fixer readers in a destination our editors have not curated, on real Postgres:
 * first-timer picks, similar places and a too-far day's swap candidates all come from the machine
 * picks, in rank order where the reader has no better one, and never from an unpicked, hidden or
 * merged row.
 */
import { randomUUID } from 'node:crypto';

import { runMigrations, withUser } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import type { FitDay } from '@cp/planner';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readPicks } from '../../src/explore/picks';
import { similarPlaces } from '../../src/explore/plan-read';
import { tooFarCandidates } from '../../src/planning/fixers/too-far-candidates';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let daLat: string;
let viewer: string;
const ids = new Map<string, string>();

interface Seed {
  readonly name: string;
  readonly category: string;
  readonly rank: number | null;
  readonly status?: string;
  readonly mergedInto?: string;
}

const SEEDS: readonly Seed[] = [
  { name: 'Hồ Xuân Hương', category: 'nature', rank: 1 },
  { name: 'Chợ Đà Lạt', category: 'market', rank: 2 },
  { name: 'Thung Lũng Tình Yêu', category: 'nature', rank: 3 },
  { name: 'Phở Hiếu', category: 'food', rank: 4 },
  { name: 'Đồi Thông Hai Mộ', category: 'nature', rank: 5 },
  { name: 'An Cafe', category: 'food', rank: 6 },
  { name: 'Đồi Cỏ Hồng', category: 'nature', rank: null },
  { name: 'Thác Ẩn', category: 'nature', rank: 7, status: 'hidden' },
  { name: 'Hồ Xuân Hương (old record)', category: 'nature', rank: 8, mergedInto: 'Hồ Xuân Hương' },
  { name: 'Khách Sạn Sương Mai', category: 'stay', rank: 9 },
];

const asViewer = <T>(fn: (tx: pg.PoolClient) => Promise<T>) => withUser(pool, viewer, 'test', fn);

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  viewer = randomUUID();
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [viewer]);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, tz)
     VALUES ('vn-da-lat', 'Đà Lạt', 'Vietnam', 'guest', 'Asia/Ho_Chi_Minh') RETURNING id`,
  );
  daLat = rows[0]?.id as string;
  for (const [index, seed] of SEEDS.entries()) {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, status, merged_into_id, pick_rank,
         pick_source)
       VALUES ($1, $2, $3, $4, 108.44, $5, $6, $7, $8) RETURNING id`,
      [
        daLat,
        seed.name,
        seed.category,
        11.94 + index * 0.004,
        seed.status ?? 'active',
        seed.mergedInto === undefined ? null : (ids.get(seed.mergedInto) ?? null),
        seed.rank,
        seed.rank === null ? null : 'fill',
      ],
    );
    ids.set(seed.name, inserted.rows[0]?.id as string);
  }
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('a destination with machine picks and no curated set', () => {
  it('shows its picks as first-timer picks, in rank order, without stays', async () => {
    const picks = await asViewer((tx) => readPicks(tx, daLat, null));
    expect(picks.map((pick) => pick.name)).toEqual([
      'Hồ Xuân Hương',
      'Chợ Đà Lạt',
      'Thung Lũng Tình Yêu',
      'Phở Hiếu',
      'Đồi Thông Hai Mộ',
      'An Cafe',
    ]);
    expect(picks.every((pick) => !pick.must_see && pick.why_go === null)).toBe(true);
  });

  it('offers picked places of the same kind as similar, in rank order', async () => {
    const similar = await asViewer((tx) =>
      similarPlaces(tx, {
        destinationId: daLat,
        poiId: ids.get('Hồ Xuân Hương') as string,
        place: { category: 'nature', tags: [] },
      }),
    );
    expect(similar.map((place) => place.name)).toEqual(['Thung Lũng Tình Yêu', 'Đồi Thông Hai Mộ']);
  });

  it('offers picked places of the day’s kinds near its stops as swaps for a too-far day', async () => {
    const day = {
      stay: null,
      items: [{ category: 'nature', locked: false, point: { lat: 11.94, lng: 108.44 } }],
    } as unknown as FitDay;
    const { candidates, names } = await asViewer((tx) => tooFarCandidates(tx, daLat, day));
    expect([...names.values()].sort()).toEqual(
      ['Hồ Xuân Hương', 'Thung Lũng Tình Yêu', 'Đồi Thông Hai Mộ'].sort(),
    );
    expect(candidates.every((candidate) => candidate.category === 'nature')).toBe(true);
  });
});
