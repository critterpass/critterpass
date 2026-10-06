/**
 * A destination with no curated media still shows pictures, on real Postgres: each first-timer
 * pick carries the first photo of its ready AI profile (none from a profile still being written,
 * none for a place the editors reviewed), and the first pick with a photo is offered as the
 * destination's cover with the place it shows.
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
const ids = new Map<string, string>();

const MEDIA_HOST = 'https://media.test';
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
  withUser(pool, viewer, 'test', (tx) => readPicks(tx, destinationId, null, MEDIA_HOST));

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
    ids.set(name, id);
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
  it("gives each pick its ready profile's first photo", async () => {
    const shown = await picks(haNoi);
    const photoOf = (name: string) => shown.find((pick) => pick.name === name)?.photo;
    const temple = ids.get('Ngoc Son Temple') as string;
    expect(shown.map((pick) => pick.name)).toEqual(SEEDS.map(([name]) => name));
    expect(photoOf('Ngoc Son Temple')).toEqual({
      url: `${MEDIA_HOST}/c/place-profiles/${temple}/1.jpg`,
      source_page: `https://commons.example/${temple}`,
    });
    expect(photoOf('Hanoi Opera House')).not.toBeNull();
    // A profile still being written, and a place with no profile, have no photo to show.
    expect(photoOf('Hoan Kiem Lake')).toBeNull();
    expect(photoOf('Long Bien Bridge')).toBeNull();
  });

  it('offers the first pick with a photo as the cover, naming the place', async () => {
    const temple = ids.get('Ngoc Son Temple') as string;
    expect(coverOf(await picks(haNoi))).toEqual({
      url: `${MEDIA_HOST}/c/place-profiles/${temple}/1.jpg`,
      source_page: `https://commons.example/${temple}`,
      poi_id: temple,
      name: 'Ngoc Son Temple',
    });
  });

  it('keeps the profile photo off a place the editors reviewed', async () => {
    const temple = ids.get('Ngoc Son Temple') as string;
    await pool.query(
      `UPDATE pois SET curation = 'editorial', editorial = '{"why_go": "A red bridge to an island temple."}'
        WHERE id = $1`,
      [temple],
    );
    try {
      const shown = await picks(haNoi);
      expect(shown.find((pick) => pick.poi_id === temple)?.photo).toBeNull();
      expect(coverOf(shown)?.name).toBe('Hanoi Opera House');
    } finally {
      await pool.query(`UPDATE pois SET curation = 'auto', editorial = '{}' WHERE id = $1`, [
        temple,
      ]);
    }
  });

  it('has no cover where no pick has a photo', async () => {
    const shown = await picks(bare);
    expect(shown).toHaveLength(1);
    expect(coverOf(shown)).toBeNull();
  });
});
