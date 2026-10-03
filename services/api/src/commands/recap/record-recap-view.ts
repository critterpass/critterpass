/**
 * `record_recap_view {recap_id, kind: open|complete}` (offline): the first open signs the crew's
 * passport stamps with the traveller's signature, live on `recap:{id}` (3m-8); `complete` marks
 * the story watched to its end. A replay or a later open changes nothing more than `seen_at`.
 */
import { appendDomainEvent } from '@cp/db';
import { recordRecapViewPayloadSchema, type RecordRecapViewResult } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { signStamps, visibleRecap } from './shared';

export const recordRecapViewCommand = defineCommand({
  name: 'record_recap_view',
  v: 1,
  schema: recordRecapViewPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await visibleRecap(tx, payload.recap_id);
  },
  handle: async (tx, payload, ctx): Promise<RecordRecapViewResult> => {
    const recap = await visibleRecap(tx, payload.recap_id);
    return asSystemRole(tx, async () => {
      const now = new Date();
      const { rows } = await tx.query<{ opened_at: Date | null }>(
        'SELECT opened_at FROM recap_views WHERE recap_id = $1 AND user_id = $2 FOR UPDATE',
        [recap.id, ctx.uid],
      );
      const firstOpen = rows[0]?.opened_at === null;
      if (payload.kind === 'open') {
        await tx.query(
          `UPDATE recap_views SET opened_at = coalesce(opened_at, $3), seen_at = $3
            WHERE recap_id = $1 AND user_id = $2`,
          [recap.id, ctx.uid, now],
        );
      } else {
        await tx.query(
          `UPDATE recap_views
              SET completed_at = coalesce(completed_at, $3), seen_at = $3,
                  opened_at = coalesce(opened_at, $3)
            WHERE recap_id = $1 AND user_id = $2`,
          [recap.id, ctx.uid, now],
        );
      }
      if (!firstOpen) return { recap_id: recap.id, signed: 0 };
      const signed = await signStamps(tx, recap, ctx.uid, now);
      await appendDomainEvent(tx, {
        type: 'recap.signed',
        aggregateKind: 'recap',
        aggregateId: recap.id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: recap.trip_id,
        payload: { trip_id: recap.trip_id, recap_id: recap.id, signer_id: ctx.uid },
      });
      return { recap_id: recap.id, signed };
    });
  },
});
