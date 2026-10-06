/**
 * `edit_postcard` (offline): the postcard's maker changes its photo, note or format. The note has
 * to fit the format it ends up in.
 */
import { appendDomainEvent } from '@cp/db';
import { editPostcardPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { checkNote, checkPhoto, requireCreator, travellerPostcard } from './shared';

export const editPostcardCommand = defineCommand({
  name: 'edit_postcard',
  v: 1,
  schema: editPostcardPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    requireCreator(await travellerPostcard(tx, payload.postcard_id), ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    const postcard = await travellerPostcard(tx, payload.postcard_id);
    requireCreator(postcard, ctx.uid);
    const next = {
      format: payload.patch.format ?? postcard.format,
      photo_id: payload.patch.photo_id === undefined ? postcard.photo_id : payload.patch.photo_id,
      note: payload.patch.note ?? postcard.note,
    };
    checkNote(next.format, next.note);
    if (next.photo_id !== postcard.photo_id) {
      await checkPhoto(tx, postcard.trip_id, next.photo_id);
    }
    return asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ version: number }>(
        `UPDATE postcards SET format = $2, photo_id = $3, note = $4, version = version + 1
          WHERE id = $1 RETURNING version`,
        [postcard.id, next.format, next.photo_id, next.note],
      );
      await appendDomainEvent(tx, {
        type: 'postcard.saved',
        aggregateKind: 'postcard',
        aggregateId: postcard.id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: postcard.trip_id,
        payload: { trip_id: postcard.trip_id, postcard_id: postcard.id },
      });
      return { postcard_id: postcard.id, version: rows[0]?.version ?? 1 };
    });
  },
});
