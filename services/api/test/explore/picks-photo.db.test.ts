/**
 * A destination with no curated media, on real Postgres: its first-timer picks offer none of the
 * photos their AI profiles found by web search (no licence we could check), so no pick stands in
 * as the destination's cover.
 */
import { randomUUID } from 'node:crypto';

import { runMigrations, withUser } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { coverOf, readPicks } from '../../src/explore/picks';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let haNoi: string;
let bare: string;
let viewer: string;

const SEEDS = [
  ['Hoan Kiem Lake', 'nature', 'pending'],
  ['Ngoc Son Temple', 'temple_shrine', 'ready'],
  ['Hanoi Opera House', 'other', 'ready'],
  ['Long Bien Bridge', 'other', null],
] as const;

const photosOf = (id: string) => [
  { key: `c/place-profiles/${id}/1.jpg`, source_page: `https://commons.example/${id}`, width: 480 },
  { key: `c/place-profiles/${id}/2.jpg`, source_page: `https://blog.example/${id}`, width: 480 },
];

const picks = (destinationId: string) =>
  withUser(pool, viewer, 'test', (tx) => readPicks(tx, destinationId, null));

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  viewer = randomUUID();
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [viewer]);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, tz) VALUES
       ('vn-ha-noi', 'Hà Nội', 'Vietnam', 'live', 'Asia/Ho_Chi_Minh'),
       ('vn-ha-giang', 'Hà Giang', 'Vietnam', 'guest', 'Asia/Ho_Chi_Minh')
     RETURNING id`,
  );
  haNoi = rows[0]?.id as string;
  bare = rows[1]?.id as string;
  for (const [index, [name, category, profile]] of SEEDS.entries()) {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, pick_rank, pick_source)
       VALUES ($1, $2, $3, $4, 105.85, $5, 'fill') RETURNING id`,
      [haNoi, name, category, 21.02 + index * 0.004, index + 1],
    );
    const id = inserted.rows[0]?.id as string;
    if (profile !== null) {
      await pool.query(
        `INSERT INTO place_profiles (poi_id, status, texts, photos) VALUES ($1, $2, '{}', $3)`,
        [id, profile, JSON.stringify(photosOf(id))],
      );
    }
  }
  await pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng, pick_rank, pick_source)
     VALUES ($1, 'Ma Pi Leng Pass', 'nature', 23.24, 105.41, 1, 'fill')`,
    [bare],
  );
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe("a destination's picks and cover without curated media", () => {
  it('shows no stored profile photo on any pick, and so no pick cover', async () => {
    const shown = await picks(haNoi);
    expect(shown.map((pick) => pick.name)).toEqual(SEEDS.map(([name]) => name));
    // Ready profiles still list scraped photos in this database: none is offered.
    expect(shown.map((pick) => pick.photo)).toEqual(SEEDS.map(() => null));
    expect(coverOf(shown)).toBeNull();
  });

  it('has no cover where no pick has a photo', async () => {
    const shown = await picks(bare);
    expect(shown).toHaveLength(1);
    expect(coverOf(shown)).toBeNull();
  });
});
