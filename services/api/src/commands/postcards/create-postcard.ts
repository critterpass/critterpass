/**
 * `create_postcard` (offline): a traveller's postcard from the trip, with the app's own id so an
 * offline draft and its replay are one postcard. The front photo is a live photo of the same trip
 * (or none: the guide's art), and the note fits what the format prints.
 */
import { appendDomainEvent } from '@cp/db';
import { createPostcardPayloadSchema, DomainError } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireTraveller } from '../album/shared';
import { checkNote, checkPhoto } from './shared';

export const createPostcardCommand = defineCommand({
  name: 'create_postcard',
  v: 1,
  schema: createPostcardPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireTraveller(tx, payload.trip_id);
  },
  handle: async (tx, payload, ctx) => {
    checkNote(payload.format, payload.note);
    await checkPhoto(tx, payload.trip_id, payload.photo_id);
    return asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ created_by: string; trip_id: string }>(
        `INSERT INTO postcards (id, trip_id, photo_id, note, format, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET id = postcards.id
         RETURNING created_by, trip_id`,
        [
          payload.postcard_id,
          payload.trip_id,
          payload.photo_id,
          payload.note,
          payload.format,
          ctx.uid,
        ],
      );
      const row = rows[0];
      // Another traveller's id (or another trip's) is never taken over.
      if (row === undefined || row.created_by !== ctx.uid || row.trip_id !== payload.trip_id) {
        throw new DomainError('NOT_FOUND', { reason: 'postcard' });
      }
      await appendDomainEvent(tx, {
        type: 'postcard.saved',
        aggregateKind: 'postcard',
        aggregateId: payload.postcard_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: payload.trip_id,
        payload: { trip_id: payload.trip_id, postcard_id: payload.postcard_id },
      });
      return { postcard_id: payload.postcard_id };
    });
  },
});
