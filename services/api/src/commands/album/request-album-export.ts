/**
 * `request_album_export` ("download all"): queues a zip of the album's originals for the caller,
 * under the app's export id (a replay finds the same export). Any traveller may ask; the zip is
 * theirs alone to download, for 7 days.
 */
import { appendDomainEvent, sendInTx } from '@cp/db';
import { ALBUM_QUEUES, requestAlbumExportPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireTraveller } from './shared';

export const requestAlbumExportCommand = defineCommand({
  name: 'request_album_export',
  v: 1,
  schema: requestAlbumExportPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireTraveller(tx, payload.trip_id);
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const { rowCount } = await tx.query(
        `INSERT INTO album_exports (id, trip_id, user_id) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [payload.export_id, payload.trip_id, ctx.uid],
      );
      if ((rowCount ?? 0) > 0) {
        await appendDomainEvent(tx, {
          type: 'album.export_requested',
          aggregateKind: 'album_export',
          aggregateId: payload.export_id,
          actorKind: 'user',
          actorId: ctx.uid,
          tripId: payload.trip_id,
          payload: { trip_id: payload.trip_id, export_id: payload.export_id, user_id: ctx.uid },
        });
        await sendInTx(
          tx,
          ALBUM_QUEUES.export,
          { export_id: payload.export_id },
          { singletonKey: payload.export_id },
        );
      }
      return { export_id: payload.export_id, status: 'queued' };
    }),
});
