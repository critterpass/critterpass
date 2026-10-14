/**
 * The profile-photo purge on a migrated Postgres, with the media bucket as an in-memory store at
 * the network edge: a dry run only counts, a real run empties every profile's photo list (text
 * kept) and deletes every object under the profile prefix and nothing outside it, and a second run
 * finds nothing left.
 */
import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { purgeProfilePhotos } from '../../../src/places/profile/purge-photos-cli';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
const objects = new Set<string>();

const store = {
  list: (prefix: string) => Promise.resolve([...objects].filter((key) => key.startsWith(prefix))),
  delete: (key: string) => {
    objects.delete(key);
    return Promise.resolve();
  },
};

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, tz)
     VALUES ('vn-da-lat', 'Đà Lạt', 'VN', 'guest', 'Asia/Ho_Chi_Minh') RETURNING id`,
  );
  const destination = rows[0]?.id as string;
  for (const [name, photos] of [
    ['Dinh III', 2],
    ['Crazy House', 1],
    ['Datanla Falls', 0],
  ] as const) {
    const poi = await pool.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, $2, 'museum', 11.93, 108.43) RETURNING id`,
      [destination, name],
    );
    const id = poi.rows[0]?.id as string;
    const list = Array.from({ length: photos }, (_, i) => ({
      key: `c/place-profiles/${id}/${String(i + 1)}.jpg`,
      source_page: 'https://blog.example/page',
    }));
    for (const photo of list) objects.add(photo.key);
    await pool.query(
      `INSERT INTO place_profiles (poi_id, status, texts, photos)
       VALUES ($1, 'ready', '{"en": {"why_go": "Kept."}}', $2)`,
      [id, JSON.stringify(list)],
    );
  }
  objects.add('c/destinations/vn-da-lat/hero.jpg');
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('profile photo purge', { timeout: 60_000 }, () => {
  it('counts without changing anything on a dry run', async () => {
    expect(await purgeProfilePhotos(pool, store, { dryRun: true })).toEqual({
      objects: 3,
      rows: 2,
      deleted: 0,
      cleared: 0,
    });
    expect(objects.size).toBe(4);
  });

  it('deletes the profile photos and their lists, keeps the text and other objects', async () => {
    expect(await purgeProfilePhotos(pool, store, { dryRun: false })).toEqual({
      objects: 3,
      rows: 2,
      deleted: 3,
      cleared: 2,
    });
    expect([...objects]).toEqual(['c/destinations/vn-da-lat/hero.jpg']);
    const { rows } = await pool.query<{ photos: unknown; why: string }>(
      "SELECT photos, texts->'en'->>'why_go' AS why FROM place_profiles",
    );
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => Array.isArray(row.photos) && row.photos.length === 0)).toBe(true);
    expect(rows.every((row) => row.why === 'Kept.')).toBe(true);
    expect(await purgeProfilePhotos(pool, store, { dryRun: false })).toEqual({
      objects: 0,
      rows: 0,
      deleted: 0,
      cleared: 0,
    });
  });
});
