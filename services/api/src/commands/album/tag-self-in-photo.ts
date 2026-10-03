/**
 * `tag_self_in_photo` (offline, "I'm in this"): a traveller marks only themself in a photo, by hand
 * or from their own device's opt-in self-match; nothing about a face reaches the server. Turning it
 * off removes their tag.
 */
import { tagSelfInPhotoPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { travellerPhoto } from './shared';

export const tagSelfInPhotoCommand = defineCommand({
  name: 'tag_self_in_photo',
  v: 1,
  schema: tagSelfInPhotoPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await travellerPhoto(tx, payload.photo_id);
  },
  handle: async (tx, payload, ctx) => {
    const photo = await travellerPhoto(tx, payload.photo_id);
    return asSystemRole(tx, async () => {
      if (payload.on) {
        await tx.query(
          `INSERT INTO photo_people (photo_id, trip_id, user_id, source) VALUES ($1, $2, $3, $4)
           ON CONFLICT (photo_id, user_id) DO UPDATE SET source = EXCLUDED.source`,
          [photo.id, photo.trip_id, ctx.uid, payload.source],
        );
      } else {
        await tx.query('DELETE FROM photo_people WHERE photo_id = $1 AND user_id = $2', [
          photo.id,
          ctx.uid,
        ]);
      }
      return { photo_id: photo.id, on: payload.on };
    });
  },
});
