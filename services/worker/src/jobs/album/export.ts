/**
 * `album.export` ("download all"): a zip of a trip album's originals for the traveller who asked,
 * streamed into R2 one photo at a time (never the whole album in memory) under their own media key,
 * readable by them alone for 7 days. Each photo is named by its day and time; photos are stored as
 * they are. An album past what one plain zip holds is cut short at its limit, oldest first.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import { ALBUM_EXPORT_DAYS, ALBUM_QUEUES, albumExportJobSchema, generateUuidV7 } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import type { MultipartSinkFactory } from './multipart-sink';
import type { AlbumMediaStore } from './process-photo';
import { ZipWriter } from './zip';

export type AlbumExportOutcome =
  | { readonly outcome: 'gone' | 'already_done' }
  | { readonly outcome: 'ready'; readonly photos: number; readonly bytes: number };

interface ExportRow {
  readonly id: string;
  readonly trip_id: string;
  readonly user_id: string;
  readonly status: string;
}

interface PhotoRow {
  readonly id: string;
  readonly media_key: string;
  readonly taken_at: Date | null;
  readonly created_at: Date;
}

function nameOf(photo: PhotoRow, index: number): string {
  const at = photo.taken_at ?? photo.created_at;
  const stamp = at.toISOString().slice(0, 19).replace(/[-:]/gu, '').replace('T', '-');
  return `${stamp}-${String(index + 1).padStart(4, '0')}.jpg`;
}

export async function exportAlbum(
  pool: pg.Pool,
  store: Pick<AlbumMediaStore, 'get'>,
  sinks: MultipartSinkFactory,
  exportId: string,
  now: Date = new Date(),
): Promise<AlbumExportOutcome> {
  const job = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<ExportRow>(
      'SELECT id, trip_id, user_id, status FROM album_exports WHERE id = $1',
      [exportId],
    );
    const row = rows[0];
    if (row === undefined || row.status !== 'queued') return row;
    const photos = await tx.query<PhotoRow>(
      `SELECT id, media_key, taken_at, created_at FROM photos
        WHERE trip_id = $1 AND deleted_at IS NULL
        ORDER BY coalesce(taken_at, created_at), id`,
      [row.trip_id],
    );
    return { ...row, photos: photos.rows };
  });
  if (job === undefined) return { outcome: 'gone' };
  if (!('photos' in job)) return { outcome: 'already_done' };

  const key = `u/${job.user_id}/album_export/${generateUuidV7()}`;
  const sink = await sinks(key, 'application/zip');
  const zip = new ZipWriter(sink);
  let added = 0;
  try {
    for (const [index, photo] of job.photos.entries()) {
      const object = await store.get(photo.media_key);
      if (object === null) continue;
      const name = nameOf(photo, index);
      if (!zip.fits(name.length, object.bytes.byteLength)) break;
      await zip.add(name, object.bytes, photo.taken_at ?? photo.created_at);
      added += 1;
    }
    await zip.finish();
  } catch (error) {
    await sink.abort();
    throw error;
  }
  const bytes = await sink.complete();

  await withSystem(pool, async (tx) => {
    await tx.query(
      `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose)
       VALUES ($1, $2, 'application/zip', $3, repeat('0', 64), 'album_export')`,
      [job.user_id, key, bytes],
    );
    await tx.query(
      `UPDATE album_exports
          SET status = 'ready', media_key = $2, photos = $3, bytes = $4,
              expires_at = $5::timestamptz + make_interval(days => $6)
        WHERE id = $1`,
      [job.id, key, added, bytes, now, ALBUM_EXPORT_DAYS],
    );
    await appendDomainEvent(tx, {
      type: 'album.export_ready',
      aggregateKind: 'album_export',
      aggregateId: job.id,
      actorKind: 'system',
      actorId: null,
      tripId: job.trip_id,
      payload: { trip_id: job.trip_id, export_id: job.id, user_id: job.user_id, photos: added },
    });
  });
  return { outcome: 'ready', photos: added, bytes };
}

export function albumExportJob(
  store: Pick<AlbumMediaStore, 'get'>,
  sinks: MultipartSinkFactory,
): AnyJobDefinition {
  return defineJob({
    queue: ALBUM_QUEUES.export,
    schema: albumExportJobSchema,
    singletonKey: (data) => data.export_id,
    async handler(data, ctx) {
      try {
        return { ...(await exportAlbum(ctx.pool, store, sinks, data.export_id)) };
      } catch (error) {
        if (ctx.job.isFinalAttempt) {
          await withSystem(ctx.pool, (tx) =>
            tx.query("UPDATE album_exports SET status = 'failed' WHERE id = $1", [data.export_id]),
          );
        }
        throw error;
      }
    },
  });
}
