import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { replacePoiFoursquarePhotos } from '../../src/places/foursquare-photos';
import { computePublicationAllowList } from '../../src/publication';
import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let uid: string;
let poiId: string;

const photo = (photoId: string, createdAt: string | null = null) => ({
  photoId,
  prefix: 'https://fastly.4sqi.net/img/general/',
  suffix: `/${photoId}.jpg`,
  width: 1440,
  height: 1920,
  createdAt,
});

const asReader = <T>(fn: Parameters<typeof withUser<T>>[3]) =>
  withUser(db.pool, uid, anonymousActor().device, fn);

function stored(): Promise<{ id: string; fsq_photo_id: string; rank: number }[]> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string; fsq_photo_id: string; rank: number }>(
      'SELECT id, fsq_photo_id, rank FROM poi_foursquare_photos WHERE poi_id = $1 ORDER BY rank',
      [poiId],
    );
    return rows;
  });
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  uid = await insertUser(db.pool);
  poiId = await withSystem(db.pool, async (tx) => {
    const { rows: destinations } = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, coverage) VALUES ('kyoto', 'Kyoto', 'live') RETURNING id",
    );
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Fushimi Inari Taisha', 'temple_shrine', 34.9671, 135.7727) RETURNING id`,
      [firstRow(destinations).id],
    );
    return firstRow(rows).id;
  });
  await withSystem(db.pool, (tx) =>
    replacePoiFoursquarePhotos(tx, poiId, [
      photo('a', '2026-09-12T04:24:36.000Z'),
      photo('b'),
      photo('c'),
    ]),
  );
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('poi_foursquare_photos RLS: public place photos (class C0, read-only, not synced)', () => {
  it('lets any signed-in reader see the photos and write nothing', async () => {
    const { rows } = await asReader((tx) =>
      tx.query<{ fsq_photo_id: string }>(
        'SELECT fsq_photo_id FROM poi_foursquare_photos WHERE poi_id = $1 ORDER BY rank',
        [poiId],
      ),
    );
    expect(rows.map((row) => row.fsq_photo_id)).toEqual(['a', 'b', 'c']);
    for (const write of [
      "UPDATE poi_foursquare_photos SET suffix = '/x.jpg'",
      'DELETE FROM poi_foursquare_photos',
      `INSERT INTO poi_foursquare_photos (poi_id, fsq_photo_id, prefix, suffix, width, height, rank)
       VALUES ('${poiId}', 'z', 'https://fastly.4sqi.net/img/general/', '/z.jpg', 1, 1, 4)`,
    ]) {
      await expect(asReader((tx) => tx.query(write))).rejects.toThrow(/permission denied/i);
    }
  });

  it('keeps the read log from every app_user', async () => {
    await expect(
      asReader((tx) => tx.query('SELECT 1 FROM poi_foursquare_photo_reads LIMIT 1')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('holds only a photo id, its address parts, its size and times', async () => {
    const { rows } = await db.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'poi_foursquare_photos'
        ORDER BY column_name`,
    );
    expect(rows.map((row) => row.column_name)).toEqual([
      'fetched_at',
      'fsq_created_at',
      'fsq_photo_id',
      'height',
      'id',
      'poi_id',
      'prefix',
      'rank',
      'suffix',
      'width',
    ]);
  });

  it('replaces the set in the new order and keeps the row of a photo that stays', async () => {
    const before = await stored();
    await withSystem(db.pool, (tx) =>
      replacePoiFoursquarePhotos(tx, poiId, [photo('c'), photo('d'), photo('a')]),
    );
    const after = await stored();
    expect(after.map((row) => [row.fsq_photo_id, row.rank])).toEqual([
      ['c', 0],
      ['d', 1],
      ['a', 2],
    ]);
    expect(after.find((row) => row.fsq_photo_id === 'a')?.id).toBe(
      before.find((row) => row.fsq_photo_id === 'a')?.id,
    );
  });

  it('empties the set for a place Foursquare has no photos of, and still notes the read', async () => {
    await withSystem(db.pool, (tx) => replacePoiFoursquarePhotos(tx, poiId, []));
    expect(await stored()).toEqual([]);
    const { rows } = await withSystem(db.pool, (tx) =>
      tx.query('SELECT 1 FROM poi_foursquare_photo_reads WHERE poi_id = $1', [poiId]),
    );
    expect(rows).toHaveLength(1);
  });

  it('refuses a sixth rank and an address that is not https', async () => {
    const insert = (rank: number, prefix: string) =>
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO poi_foursquare_photos (poi_id, fsq_photo_id, prefix, suffix, width, height, rank)
           VALUES ($1, 'bad', $2, '/bad.jpg', 10, 10, $3)`,
          [poiId, prefix, rank],
        ),
      );
    await expect(insert(5, 'https://fastly.4sqi.net/img/general/')).rejects.toThrow(
      /check constraint/i,
    );
    await expect(insert(0, 'http://fastly.4sqi.net/img/general/')).rejects.toThrow(
      /check constraint/i,
    );
  });

  it('never enters the powersync publication', () => {
    const published = computePublicationAllowList();
    expect(published).not.toContain('poi_foursquare_photos');
    expect(published).not.toContain('poi_foursquare_photo_reads');
  });
});
