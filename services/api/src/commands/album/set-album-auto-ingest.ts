/**
 * `set_album_auto_ingest` (offline): a traveller's "Add my trip photos automatically" switch for one
 * trip, kept so every device of theirs follows it. The scan itself runs on the phone, only over
 * photos taken between the trip's dates.
 */
import { setAlbumAutoIngestPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireTraveller } from './shared';

export const setAlbumAutoIngestCommand = defineCommand({
  name: 'set_album_auto_ingest',
  v: 1,
  schema: setAlbumAutoIngestPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireTraveller(tx, payload.trip_id);
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      await tx.query(
        `INSERT INTO album_prefs (trip_id, user_id, auto_ingest) VALUES ($1, $2, $3)
         ON CONFLICT (trip_id, user_id) DO UPDATE SET auto_ingest = EXCLUDED.auto_ingest`,
        [payload.trip_id, ctx.uid, payload.on],
      );
      return { trip_id: payload.trip_id, on: payload.on };
    }),
});
