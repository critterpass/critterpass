/**
 * Explore's first-timer picks and the recommended order read a destination's brief first, on real
 * Postgres and a real pg-boss producer: its essentials lead in the brief's rank with the brief's
 * line (in the reader's language once it has one; a missing language is queued for translation),
 * and without a ready brief the picks stay in rank order. A trip to a destination with no ready
 * brief queues one; a ready brief queues nothing.
 */
import { randomUUID } from 'node:crypto';

import { recommendedOrderSql, recommendedSql, runMigrations, withSystem, withUser } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readPicks } from '../../src/explore/picks';
import { startJobProducer } from '../../src/jobs/producer';
import { queueBriefWhenMissing } from '../../src/places/on-demand-ingest';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let producer: PgBoss;
let daLat: string;
let viewer: string;
const ids = new Map<string, string>();

const SEEDS = [
  ['Hồ Xuân Hương', 'nature'],
  ['Chợ Đà Lạt', 'market'],
  ['Thung Lũng Tình Yêu', 'nature'],
  ['Phở Hiếu', 'food'],
  ['Đồi Thông Hai Mộ', 'nature'],
] as const;

const asViewer = <T>(fn: (tx: pg.PoolClient) => Promise<T>) => withUser(pool, viewer, 'test', fn);

async function jobs(queue: string): Promise<unknown[]> {
  const { rows } = await pool.query<{ data: unknown }>(
    'SELECT data FROM pgboss.job WHERE name = $1 ORDER BY created_on',
    [queue],
  );
  return rows.map((row) => row.data);
}

async function setBrief(status: string, essentials: object[]): Promise<void> {
  await pool.query(
    `INSERT INTO destination_briefs (destination_id, status, essentials, generated_at, expires_at)
     VALUES ($1, $2, $3, now(), now() + interval '90 days')
     ON CONFLICT (destination_id) DO UPDATE SET status = $2, essentials = $3`,
    [daLat, status, JSON.stringify(essentials)],
  );
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  producer = await startJobProducer({
    connectionString: postgres.getConnectionUri(),
    logger: { error: () => undefined },
  });
  viewer = randomUUID();
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [viewer]);
  await pool.query("INSERT INTO user_settings (user_id, app_locale) VALUES ($1, 'fr')", [viewer]);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, tz)
     VALUES ('vn-da-lat', 'Đà Lạt', 'Vietnam', 'guest', 'Asia/Ho_Chi_Minh') RETURNING id`,
  );
  daLat = rows[0]?.id as string;
  for (const [index, [name, category]] of SEEDS.entries()) {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, pick_rank, pick_source)
       VALUES ($1, $2, $3, $4, 108.44, $5, 'fill') RETURNING id`,
      [daLat, name, category, 11.94 + index * 0.004, index + 1],
    );
    ids.set(name, inserted.rows[0]?.id as string);
  }
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await pool?.end();
  await postgres?.stop();
});

const essential = (name: string, rank: number, why: Record<string, string>) => ({
  poi_id: ids.get(name),
  rank,
  why,
  sources: [{ url: 'https://example.vn/da-lat', title: 'Đà Lạt', quote: name }],
});

describe('a destination with a brief', () => {
  it('without a ready one, keeps the picks in rank order and queues a brief for a trip', async () => {
    await setBrief('pending', [essential('Phở Hiếu', 1, { en: 'Beef noodles.' })]);
    const picks = await asViewer((tx) => readPicks(tx, daLat, null));
    expect(picks.slice(0, 2).map((pick) => pick.name)).toEqual(['Hồ Xuân Hương', 'Chợ Đà Lạt']);
    expect(picks.every((pick) => !pick.must_see)).toBe(true);
    expect(await withSystem(pool, (tx) => queueBriefWhenMissing(tx, daLat, false))).toBe(true);
    expect(await jobs('places.destination_brief')).toEqual([{ destination_id: daLat }]);
  });

  it('leads with its essentials in its rank, with its line, and queues the reader’s language', async () => {
    await setBrief('ready', [
      essential('Phở Hiếu', 1, { en: 'Beef noodles at a counter.', fr: 'Des nouilles au bœuf.' }),
      essential('Đồi Thông Hai Mộ', 2, { en: 'Two graves under the pines.' }),
    ]);
    const picks = await asViewer((tx) => readPicks(tx, daLat, null));
    expect(picks.slice(0, 3).map((pick) => [pick.name, pick.must_see, pick.why_go])).toEqual([
      ['Phở Hiếu', true, 'Des nouilles au bœuf.'],
      ['Đồi Thông Hai Mộ', true, 'Two graves under the pines.'],
      ['Hồ Xuân Hương', false, null],
    ]);
    expect(await jobs('places.brief_translate')).toEqual([{ destination_id: daLat, locale: 'fr' }]);

    // Every reader of the recommended order sees the essentials first too.
    const { rows } = await pool.query<{ name: string }>(
      `SELECT p.name FROM pois p WHERE p.destination_id = $1 AND ${recommendedSql('p')}
        ORDER BY ${recommendedOrderSql('p')}, p.id`,
      [daLat],
    );
    expect(rows.map((row) => row.name).slice(0, 3)).toEqual([
      'Phở Hiếu',
      'Đồi Thông Hai Mộ',
      'Hồ Xuân Hương',
    ]);
    // A ready brief is not queued again.
    expect(await withSystem(pool, (tx) => queueBriefWhenMissing(tx, daLat, false))).toBe(false);
  });
});
