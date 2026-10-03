/**
 * `set_album_pick` (offline): a traveller puts a photo in the album's picks or takes it out. Their
 * choice overrides the guide's either way (the next curation keeps it), and the pick glints in live
 * on `trip_album:{trip_id}`.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import { ALBUM_RT, channelName, setAlbumPickPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { travellerPhoto } from './shared';

export const setAlbumPickCommand = defineCommand({
  name: 'set_album_pick',
  v: 1,
  schema: setAlbumPickPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await travellerPhoto(tx, payload.photo_id);
  },
  handle: async (tx, payload, ctx) => {
    const photo = await travellerPhoto(tx, payload.photo_id);
    return asSystemRole(tx, async () => {
      await tx.query(
        `INSERT INTO album_picks (trip_id, photo_id, picked, picked_by, picker_id)
         VALUES ($1, $2, $3, 'user', $4)
         ON CONFLICT (trip_id, photo_id) DO UPDATE
            SET picked = EXCLUDED.picked, picked_by = 'user', picker_id = EXCLUDED.picker_id`,
        [photo.trip_id, photo.id, payload.picked, ctx.uid],
      );
      await tx.query('UPDATE photos SET is_pick = $2 WHERE id = $1', [photo.id, payload.picked]);
      await appendDomainEvent(tx, {
        type: 'album.pick_changed',
        aggregateKind: 'photo',
        aggregateId: photo.id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: photo.trip_id,
        payload: { trip_id: photo.trip_id, photo_id: photo.id, picked: payload.picked },
      });
      await outbox(tx, channelName('trip_album', photo.trip_id), ALBUM_RT.photoPicked, {
        photo_id: photo.id,
        picked: payload.picked,
        picked_by: 'user',
      });
      return { photo_id: photo.id, picked: payload.picked };
    });
  },
});
