/**
 * `delete_photo` (offline): the uploader, or an organiser of the trip, takes a photo out of the
 * album. The row is hidden at once and its picks and tags go with it; the bytes are erased with
 * the media manifest.
 */
import { appendDomainEvent } from '@cp/db';
import { deletePhotoPayloadSchema, DomainError } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { travellerPhoto, type VisiblePhoto } from './shared';

async function deletable(tx: pg.PoolClient, photoId: string, uid: string): Promise<VisiblePhoto> {
  const photo = await travellerPhoto(tx, photoId);
  if (photo.uploader_id === uid) return photo;
  const { rows } = await tx.query<{ organiser: boolean }>(
    'SELECT app.is_trip_organiser($1) AS organiser',
    [photo.trip_id],
  );
  if (rows[0]?.organiser !== true) throw new DomainError('FORBIDDEN', { reason: 'not_yours' });
  return photo;
}

export const deletePhotoCommand = defineCommand({
  name: 'delete_photo',
  v: 1,
  schema: deletePhotoPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await deletable(tx, payload.photo_id, ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    const photo = await deletable(tx, payload.photo_id, ctx.uid);
    return asSystemRole(tx, async () => {
      await tx.query(
        'UPDATE photos SET deleted_at = now(), is_pick = false WHERE id = $1 AND deleted_at IS NULL',
        [photo.id],
      );
      await tx.query('DELETE FROM album_picks WHERE photo_id = $1', [photo.id]);
      await tx.query('DELETE FROM photo_people WHERE photo_id = $1', [photo.id]);
      await appendDomainEvent(tx, {
        type: 'photo.deleted',
        aggregateKind: 'photo',
        aggregateId: photo.id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: photo.trip_id,
        payload: { trip_id: photo.trip_id, photo_id: photo.id },
      });
      return { photo_id: photo.id, deleted: true };
    });
  },
});
