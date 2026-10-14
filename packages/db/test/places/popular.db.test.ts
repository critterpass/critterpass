/**
 * The popular set on the real schema: the editors' essentials, the ready brief's essentials by
 * rank, its eateries, then the editors' must-sees; transit, stays, health, closed and merged rows
 * never count; at most forty per destination.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POPULAR_LIMIT, isPopularPlace, popularPlaces } from '../../src/places/popular';
import { withSystem } from '../../src/tx';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let pool: pg.Pool;

async function destination(slug: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz) VALUES ($1, $1, 'guest', 'Asia/Ho_Chi_Minh')
     RETURNING id`,
    [slug],
  );
  return rows[0]?.id as string;
}

async function place(
  destinationId: string,
  name: string,
  editorial: object = {},
  options: { category?: string; status?: string } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, editorial, status)
     VALUES ($1, $2, $3, 11.94, 108.44, $4, $5) RETURNING id`,
    [
      destinationId,
      name,
      options.category ?? 'nature',
      JSON.stringify(editorial),
      options.status ?? 'active',
    ],
  );
  return rows[0]?.id as string;
}

async function names(destinationId: string): Promise<string[]> {
  const popular = await withSystem(pool, (tx) => popularPlaces(tx, destinationId));
  if (popular.length === 0) return [];
  const { rows } = await pool.query<{ id: string; name: string }>(
    'SELECT id, name FROM pois WHERE id = ANY($1)',
    [popular.map((p) => p.poiId)],
  );
  const byId = new Map(rows.map((row) => [row.id, row.name]));
  expect(popular.map((p) => p.rank)).toEqual(popular.map((_, i) => i + 1));
  return popular.map((p) => byId.get(p.poiId) ?? '?');
}

let town: string;
let ids: Record<string, string>;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  pool = db.pool;
  town = await destination('town');
  ids = {
    mustSee: await place(town, 'must-see', { must_see: true }),
    briefSecond: await place(town, 'brief second'),
    eatery: await place(town, 'eatery', {}, { category: 'food' }),
    essential: await place(town, 'editors essential', { essential: true, must_see: true }),
    briefFirst: await place(town, 'brief first', { must_see: true }),
    unknown: await place(town, 'not mentioned'),
    station: await place(town, 'bus station', { essential: true }, { category: 'transit' }),
    hotel: await place(town, 'hotel', { must_see: true }, { category: 'stay' }),
    clinic: await place(town, 'clinic', { must_see: true }, { category: 'health' }),
    closed: await place(town, 'closed', { essential: true }, { status: 'closed' }),
    merged: await place(town, 'merged', { essential: true }),
  };
  await pool.query('UPDATE pois SET merged_into_id = $1 WHERE id = $2', [
    ids['briefFirst'],
    ids['merged'],
  ]);
  const entry = (poiId: string | undefined, rank: number) => ({ poi_id: poiId, rank });
  await pool.query(
    `INSERT INTO destination_briefs (destination_id, status, essentials, eateries)
     VALUES ($1, 'ready', $2, $3)`,
    [
      town,
      JSON.stringify([
        entry(ids['briefSecond'], 2),
        entry(ids['briefFirst'], 1),
        entry(ids['station'], 3),
      ]),
      JSON.stringify([{ poi_id: ids['eatery'] }, { poi_id: ids['briefSecond'] }]),
    ],
  );
}, 240_000);

afterAll(async () => {
  await db?.drop();
  await container?.stop();
});

describe('popular places', () => {
  it('orders essentials, brief essentials, eateries, then must-sees, each place once', async () => {
    expect(await names(town)).toEqual([
      'editors essential',
      'brief first',
      'brief second',
      'eatery',
      'must-see',
    ]);
  });

  it('leaves out transit, stays, health, closed and merged rows', async () => {
    const result = await names(town);
    for (const name of ['bus station', 'hotel', 'clinic', 'closed', 'merged', 'not mentioned']) {
      expect(result).not.toContain(name);
    }
    const check = (id: string | undefined) =>
      withSystem(pool, (tx) => isPopularPlace(tx, id as string));
    expect(await check(ids['eatery'])).toBe(true);
    expect(await check(ids['station'])).toBe(false);
    expect(await check(ids['unknown'])).toBe(false);
  });

  it('ignores a brief that is not ready', async () => {
    await pool.query(`UPDATE destination_briefs SET status = 'failed' WHERE destination_id = $1`, [
      town,
    ]);
    expect(await names(town)).toEqual(['editors essential', 'brief first', 'must-see']);
    await pool.query(`UPDATE destination_briefs SET status = 'ready' WHERE destination_id = $1`, [
      town,
    ]);
  });

  it('stops at the cap', async () => {
    const big = await destination('big');
    await pool.query(
      `INSERT INTO pois (destination_id, name, category, lat, lng, editorial)
       SELECT $1, 'sight ' || n, 'museum', 11.9, 108.4, '{"must_see": true}'
         FROM generate_series(1, $2) AS n`,
      [big, POPULAR_LIMIT + 5],
    );
    const popular = await withSystem(pool, (tx) => popularPlaces(tx, big));
    expect(popular).toHaveLength(POPULAR_LIMIT);
  });
});
