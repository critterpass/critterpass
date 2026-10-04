/**
 * "Recommended" on the real schema: editorial places and machine picks, in one order (the
 * editors' must-sees, the rest of the curated set, then picks by rank), the same through the
 * guide's view; and which destinations still need picks. The pick columns keep each other honest.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  LLM_RECOMMENDED,
  LLM_RECOMMENDED_ORDER,
  MIN_CURATED_PLACES,
  pickCoverage,
  recommendedOrderSql,
  recommendedSql,
} from '../src/places/recommended';
import { withSystem } from '../src/tx';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from './helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let pool: pg.Pool;
let mixed: string;
let curated: string;
let bare: string;

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
  options: {
    curation?: 'auto' | 'editorial';
    mustSee?: boolean;
    rank?: number;
    source?: 'named' | 'fill';
  } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng, curation, editorial, pick_rank, pick_source)
     VALUES ($1, $2, 'nature', 11.94, 108.44, $3, $4, $5, $6)`,
    [
      destinationId,
      name,
      options.curation ?? 'auto',
      JSON.stringify(options.mustSee === undefined ? {} : { must_see: options.mustSee }),
      options.rank ?? null,
      options.rank === undefined ? null : (options.source ?? 'fill'),
    ],
  );
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  pool = db.pool;
  mixed = await destination('mixed');
  await place(mixed, 'open data, not picked');
  await place(mixed, 'pick two', { rank: 2 });
  await place(mixed, 'editorial', { curation: 'editorial', mustSee: false });
  await place(mixed, 'pick one', { rank: 1, source: 'named' });
  await place(mixed, 'editorial must-see', { curation: 'editorial', mustSee: true });
  curated = await destination('curated');
  await pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng, curation)
     SELECT $1, 'curated ' || n, 'food', 15.88, 108.33, 'editorial' FROM generate_series(1, $2) AS n`,
    [curated, MIN_CURATED_PLACES],
  );
  bare = await destination('bare');
  await place(bare, 'open data only');
}, 240_000);

afterAll(async () => {
  await db?.drop();
  await container?.stop();
});

describe('the recommended set', () => {
  it('is the editorial places and the picks, must-sees first, then curated, then by rank', async () => {
    const { rows } = await pool.query<{ name: string }>(
      `SELECT p.name FROM pois p WHERE p.destination_id = $1 AND ${recommendedSql('p')}
        ORDER BY ${recommendedOrderSql('p')}, p.id`,
      [mixed],
    );
    expect(rows.map((row) => row.name)).toEqual([
      'editorial must-see',
      'editorial',
      'pick one',
      'pick two',
    ]);
    const bareNames = await pool.query(
      `SELECT name FROM pois WHERE destination_id = $1 AND ${recommendedSql(null)}
        ORDER BY ${recommendedOrderSql(null)}`,
      [bare],
    );
    expect(bareNames.rows).toEqual([]);
  });

  it('reads the same through the guide’s view', async () => {
    const { rows } = await pool.query<{ name: string }>(
      `SELECT name FROM llm.pois WHERE destination_id = $1 AND ${LLM_RECOMMENDED}
        ORDER BY ${LLM_RECOMMENDED_ORDER}, id`,
      [mixed],
    );
    expect(rows.map((row) => row.name)).toEqual([
      'editorial must-see',
      'editorial',
      'pick one',
      'pick two',
    ]);
  });

  it('knows which destinations still need picks', async () => {
    const coverage = (id: string) => withSystem(pool, (tx) => pickCoverage(tx, id));
    expect(await coverage(bare)).toEqual({ curated: 0, picked: false, needsPicks: true });
    expect(await coverage(mixed)).toEqual({ curated: 2, picked: true, needsPicks: false });
    expect(await coverage(curated)).toEqual({
      curated: MIN_CURATED_PLACES,
      picked: false,
      needsPicks: false,
    });
  });

  it('refuses a rank without its source, a source without its rank, and a rank under one', async () => {
    const insert = (rank: number | null, source: string | null) =>
      pool.query(
        `INSERT INTO pois (destination_id, name, category, lat, lng, pick_rank, pick_source)
         VALUES ($1, 'bad pick', 'food', 11.9, 108.4, $2, $3)`,
        [bare, rank, source],
      );
    await expect(insert(1, null)).rejects.toThrow(/pois_pick_check/u);
    await expect(insert(null, 'fill')).rejects.toThrow(/pois_pick_check/u);
    await expect(insert(0, 'fill')).rejects.toThrow(/pois_pick_check/u);
    await expect(insert(3, 'guess')).rejects.toThrow(/pois_pick_check/u);
  });
});
