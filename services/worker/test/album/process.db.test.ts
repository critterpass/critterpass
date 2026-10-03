/**
 * The album's worker side against a migrated Postgres, R2 kept in memory: a registered photo that
 * still carries a GPS position is re-encoded without it, gets a thumbnail and a display copy as
 * trip media, turns `processed` and drops in live on the album channel, once; a deleted photo is
 * left alone; "download all" zips the live photos into the asker's own export, readable 7 days.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exifHasGps } from '../../src/jobs/album/exif-gps';
import { exportAlbum } from '../../src/jobs/album/export';
import type { MultipartSinkFactory } from '../../src/jobs/album/multipart-sink';
import { processAlbumPhoto, type AlbumMediaStore } from '../../src/jobs/album/process-photo';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let tripId: string;
let uploader: string;
const objects = new Map<string, Uint8Array>();
const store: AlbumMediaStore = {
  get: (key) => {
    const bytes = objects.get(key);
    return Promise.resolve(bytes === undefined ? null : { bytes, contentType: 'image/jpeg' });
  },
  put: (key, bytes) => {
    objects.set(key, bytes);
    return Promise.resolve();
  },
};

async function q<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, [...params])).rows as T[]);
}

async function photo(located: boolean): Promise<string> {
  let image = sharp({
    create: { width: 3000, height: 2000, channels: 3, background: '#3a7' },
  }).jpeg();
  if (located)
    image = image.withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '16/1 3/1 0/1' } });
  const bytes = new Uint8Array(await image.toBuffer());
  const id = randomUUID();
  const key = `u/${uploader}/photo/${randomUUID()}`;
  objects.set(key, bytes);
  await q(
    `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose, trip_id)
     VALUES ($1, $2, 'image/jpeg', $3, repeat('c', 64), 'photo', $4)`,
    [uploader, key, bytes.byteLength, tripId],
  );
  await q(
    `INSERT INTO photos (id, trip_id, uploader_id, media_key, sha256, taken_at)
     VALUES ($1, $2, $3, $4, $5, '2026-10-03T01:00:00Z')`,
    [id, tripId, uploader, key, randomUUID().replace(/-/gu, '').padEnd(64, '0')],
  );
  return id;
}

beforeAll(async () => {
  harness = await startJobsHarness();
  uploader = randomUUID();
  await q("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', 'Anna')", [
    uploader,
  ]);
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Album', $1) RETURNING id",
    [uploader],
  );
  const [trip] = await q<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crew!.id],
  );
  tripId = trip!.id;
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('album.process_photo', { timeout: 60_000 }, () => {
  it('removes a GPS position, makes a thumbnail and a display copy, and drops the photo in once', async () => {
    const id = await photo(true);
    expect(await processAlbumPhoto(harness.pool, store, id)).toEqual({
      outcome: 'processed',
      stripped_gps: true,
    });
    const [row] = await q<{
      media_key: string;
      thumb_key: string;
      display_key: string;
      width: number;
      height: number;
      upload_state: string;
      exif_gps_stripped: boolean;
    }>(
      `SELECT media_key, thumb_key, display_key, width, height, upload_state, exif_gps_stripped
         FROM photos WHERE id = $1`,
      [id],
    );
    expect(row).toMatchObject({
      width: 3000,
      height: 2000,
      upload_state: 'processed',
      exif_gps_stripped: true,
    });
    const original = (await sharp(objects.get(row!.media_key)).metadata()).exif;
    expect(exifHasGps(original === undefined ? undefined : new Uint8Array(original))).toBe(false);
    const thumb = await sharp(objects.get(row!.thumb_key)).metadata();
    const display = await sharp(objects.get(row!.display_key)).metadata();
    expect([thumb.width, display.width]).toEqual([480, 1600]);
    const media = await q<{ trip_id: string; owner_id: string }>(
      'SELECT trip_id, owner_id FROM media_objects WHERE r2_key = ANY($1)',
      [[row!.thumb_key, row!.display_key]],
    );
    expect(media).toEqual([
      { trip_id: tripId, owner_id: uploader },
      { trip_id: tripId, owner_id: uploader },
    ]);

    expect(await processAlbumPhoto(harness.pool, store, id)).toEqual({
      outcome: 'already_processed',
    });
    const { rows } = await harness.pool.query<{ type: string }>(
      "SELECT payload->>'type' AS type FROM rt_outbox WHERE channel = $1",
      [`trip_album:${tripId}`],
    );
    expect(rows.map((r) => r.type)).toEqual(['photo.added']);
  });

  it('leaves a photo without a position as it came, and a deleted photo alone', async () => {
    const plain = await photo(false);
    const before = objects.get(
      (await q<{ media_key: string }>('SELECT media_key FROM photos WHERE id = $1', [plain]))[0]!
        .media_key,
    );
    expect(await processAlbumPhoto(harness.pool, store, plain)).toEqual({
      outcome: 'processed',
      stripped_gps: false,
    });
    const [after] = await q<{ media_key: string }>('SELECT media_key FROM photos WHERE id = $1', [
      plain,
    ]);
    expect(objects.get(after!.media_key)).toBe(before);
    const gone = await photo(false);
    await q('UPDATE photos SET deleted_at = now() WHERE id = $1', [gone]);
    expect(await processAlbumPhoto(harness.pool, store, gone)).toEqual({ outcome: 'gone' });
  });
});

describe('album.export', { timeout: 60_000 }, () => {
  it("zips the album's live photos into the asker's own download for 7 days", async () => {
    const parts: Uint8Array[] = [];
    let stored: string | undefined;
    const sinks: MultipartSinkFactory = (key) => {
      stored = key;
      return Promise.resolve({
        write: (chunk) => {
          parts.push(chunk);
          return Promise.resolve();
        },
        complete: () => Promise.resolve(parts.reduce((sum, p) => sum + p.byteLength, 0)),
        abort: () => Promise.resolve(),
      });
    };
    const exportId = randomUUID();
    await q(`INSERT INTO album_exports (id, trip_id, user_id) VALUES ($1, $2, $3)`, [
      exportId,
      tripId,
      uploader,
    ]);
    const live = await q<{ n: number }>(
      'SELECT count(*)::int AS n FROM photos WHERE trip_id = $1 AND deleted_at IS NULL',
      [tripId],
    );
    const outcome = await exportAlbum(
      harness.pool,
      store,
      sinks,
      exportId,
      new Date('2026-10-05T00:00:00Z'),
    );
    expect(outcome).toMatchObject({ outcome: 'ready', photos: live[0]!.n });
    expect(stored).toMatch(new RegExp(`^u/${uploader}/album_export/`));
    const zip = Buffer.concat(parts);
    expect(zip.readUInt16LE(zip.byteLength - 22 + 10)).toBe(live[0]!.n);
    const [row] = await q<{ status: string; media_key: string; expires_at: Date }>(
      'SELECT status, media_key, expires_at FROM album_exports WHERE id = $1',
      [exportId],
    );
    expect(row).toMatchObject({ status: 'ready', media_key: stored });
    expect(row!.expires_at.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(await exportAlbum(harness.pool, store, sinks, exportId)).toEqual({
      outcome: 'already_done',
    });
  });
});
