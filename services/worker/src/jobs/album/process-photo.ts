/**
 * `album.process_photo`: makes a registered album photo ready to show. The original is checked for
 * a GPS position in its EXIF (the device strips it, the server makes sure): one still there is
 * removed by re-encoding the original without metadata. Then a thumbnail (480 px) and a display
 * copy (1600 px) are written next to it as trip media, the photo turns `processed`, and it drops in
 * live on `trip_album:{trip_id}`. A photo deleted meanwhile is left alone.
 */
import { createHash } from 'node:crypto';

import { outbox, withSystem } from '@cp/db';
import {
  ALBUM_DISPLAY_PX,
  ALBUM_QUEUES,
  ALBUM_RT,
  ALBUM_THUMB_PX,
  albumProcessPhotoJobSchema,
  channelName,
  generateUuidV7,
} from '@cp/domain';
import type pg from 'pg';
import sharp from 'sharp';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import type { AvatarMediaStore } from '../avatar/media-store';
import { exifHasGps } from './exif-gps';

export type AlbumMediaStore = Pick<AvatarMediaStore, 'get' | 'put'>;

export type ProcessPhotoOutcome =
  | { readonly outcome: 'gone' | 'already_processed' }
  | { readonly outcome: 'processed'; readonly stripped_gps: boolean };

interface PhotoRow {
  readonly id: string;
  readonly trip_id: string;
  readonly uploader_id: string;
  readonly media_key: string;
  readonly upload_state: string;
  readonly width: number | null;
  readonly height: number | null;
}

async function resized(bytes: Uint8Array, px: number, quality: number): Promise<Uint8Array> {
  const out = await sharp(bytes, { failOn: 'error' })
    .rotate()
    .resize({ width: px, height: px, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  return new Uint8Array(out);
}

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function processAlbumPhoto(
  pool: pg.Pool,
  store: AlbumMediaStore,
  photoId: string,
): Promise<ProcessPhotoOutcome> {
  const photo = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<PhotoRow>(
      `SELECT id, trip_id, uploader_id, media_key, upload_state, width, height FROM photos
        WHERE id = $1 AND deleted_at IS NULL`,
      [photoId],
    );
    return rows[0];
  });
  if (photo === undefined) return { outcome: 'gone' };
  if (photo.upload_state === 'processed') return { outcome: 'already_processed' };
  const original = await store.get(photo.media_key);
  if (original === null) throw new Error(`album photo ${photoId} is not uploaded yet`);

  const meta = await sharp(original.bytes, { failOn: 'error' }).metadata();
  const strippedGps = exifHasGps(meta.exif === undefined ? undefined : new Uint8Array(meta.exif));
  let source = original.bytes;
  if (strippedGps) {
    // sharp writes no metadata unless asked: the re-encoded original carries no position.
    source = new Uint8Array(
      await sharp(original.bytes, { failOn: 'error' }).rotate().jpeg({ quality: 92 }).toBuffer(),
    );
    await store.put(photo.media_key, source, 'image/jpeg');
  }
  const thumb = await resized(source, ALBUM_THUMB_PX, 72);
  const display = await resized(source, ALBUM_DISPLAY_PX, 82);
  const thumbKey = `u/${photo.uploader_id}/photo/${generateUuidV7()}`;
  const displayKey = `u/${photo.uploader_id}/photo/${generateUuidV7()}`;
  await store.put(thumbKey, thumb, 'image/jpeg');
  await store.put(displayKey, display, 'image/jpeg');
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = photo.width ?? (rotated ? meta.height : meta.width) ?? null;
  const height = photo.height ?? (rotated ? meta.width : meta.height) ?? null;

  await withSystem(pool, async (tx) => {
    for (const [key, bytes] of [
      [thumbKey, thumb],
      [displayKey, display],
    ] as const) {
      await tx.query(
        `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose, trip_id)
         VALUES ($1, $2, 'image/jpeg', $3, $4, 'photo', $5)`,
        [photo.uploader_id, key, bytes.byteLength, sha(bytes), photo.trip_id],
      );
    }
    if (strippedGps) {
      await tx.query(
        `UPDATE media_objects SET bytes = $3, sha256 = $4 WHERE owner_id = $1 AND r2_key = $2`,
        [photo.uploader_id, photo.media_key, source.byteLength, sha(source)],
      );
    }
    const { rowCount } = await tx.query(
      `UPDATE photos
          SET thumb_key = $2, display_key = $3, width = $4, height = $5,
              exif_gps_stripped = true, upload_state = 'processed'
        WHERE id = $1 AND deleted_at IS NULL`,
      [photo.id, thumbKey, displayKey, width, height],
    );
    if ((rowCount ?? 0) > 0) {
      await outbox(tx, channelName('trip_album', photo.trip_id), ALBUM_RT.photoAdded, {
        photo_id: photo.id,
        uploader_id: photo.uploader_id,
        thumb_key: thumbKey,
      });
    }
  });
  return { outcome: 'processed', stripped_gps: strippedGps };
}

export function albumProcessPhotoJob(store: AlbumMediaStore): AnyJobDefinition {
  return defineJob({
    queue: ALBUM_QUEUES.processPhoto,
    schema: albumProcessPhotoJobSchema,
    singletonKey: (data) => data.photo_id,
    async handler(data, { pool }) {
      return { ...(await processAlbumPhoto(pool, store, data.photo_id)) };
    },
  });
}
