/**
 * `register_photo` (offline, after the upload): files an uploaded photo in the trip's album under
 * the app's own id. The bytes must be the caller's own upload (purpose `photo`); the same picture
 * already in the album (same SHA-256) registers once, answering the photo it duplicates. The
 * original becomes trip media (the crew may read it), `photo.added` goes out (the recap re-runs on
 * late photos) and the worker makes its thumbnail.
 */
import { appendDomainEvent, sendInTx } from '@cp/db';
import {
  ALBUM_QUEUES,
  DomainError,
  registerPhotoPayloadSchema,
  type RegisterPhotoResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireTraveller } from './shared';

export const registerPhotoCommand = defineCommand({
  name: 'register_photo',
  v: 1,
  schema: registerPhotoPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireTraveller(tx, payload.trip_id);
    const { rows } = await asSystemRole(tx, () =>
      tx.query(
        `SELECT 1 FROM media_objects
          WHERE owner_id = $1 AND r2_key = $2 AND purpose = 'photo'`,
        [ctx.uid, payload.media_key],
      ),
    );
    if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'media' });
  },
  handle: (tx, payload, ctx): Promise<RegisterPhotoResult> =>
    asSystemRole(tx, async () => {
      const { rows: same } = await tx.query<{ id: string }>(
        `SELECT id FROM photos
          WHERE id = $1 OR (trip_id = $2 AND sha256 = $3 AND deleted_at IS NULL)
          ORDER BY (id = $1) DESC LIMIT 1`,
        [payload.photo_id, payload.trip_id, payload.sha256],
      );
      const existing = same[0]?.id;
      if (existing !== undefined) {
        return {
          photo_id: payload.photo_id,
          duplicate_of: existing === payload.photo_id ? null : existing,
        };
      }
      await tx.query(
        `INSERT INTO photos (id, trip_id, uploader_id, media_key, sha256, phash, taken_at,
           local_date, width, height, quality, exif_gps_stripped, faces_opt_in)
         SELECT $1, t.id, $3, $4, $5, $6, $7::timestamptz,
                ($7::timestamptz AT TIME ZONE coalesce(t.tz, d.tz, 'UTC'))::date,
                $8, $9, $10, $11, $12
           FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
          WHERE t.id = $2`,
        [
          payload.photo_id,
          payload.trip_id,
          ctx.uid,
          payload.media_key,
          payload.sha256,
          payload.phash ?? null,
          payload.taken_at ?? null,
          payload.width ?? null,
          payload.height ?? null,
          JSON.stringify(payload.quality ?? {}),
          payload.exif_gps_stripped,
          payload.faces_opt_in,
        ],
      );
      await tx.query('UPDATE media_objects SET trip_id = $3 WHERE owner_id = $1 AND r2_key = $2', [
        ctx.uid,
        payload.media_key,
        payload.trip_id,
      ]);
      await appendDomainEvent(tx, {
        type: 'photo.added',
        aggregateKind: 'photo',
        aggregateId: payload.photo_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: payload.trip_id,
        payload: { trip_id: payload.trip_id, photo_id: payload.photo_id, uploader_id: ctx.uid },
      });
      await sendInTx(
        tx,
        ALBUM_QUEUES.processPhoto,
        { photo_id: payload.photo_id },
        { singletonKey: payload.photo_id },
      );
      return { photo_id: payload.photo_id, duplicate_of: null };
    }),
});
