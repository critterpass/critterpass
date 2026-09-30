/**
 * `resolve_dropout` (doc delta, docs/api-contracts-proposal.md): an organiser applies a dropout's
 * re-split. The change list on `trip_dropouts` is what they act on (rooms, supplier seats,
 * third-party stays are changed where they live); resolving it re-prices the trip without the
 * member who left. Resolving twice changes nothing.
 */
import { sendInTx } from '@cp/db';
import { DomainError, resolveDropoutPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { COST_RECOMPUTE_QUEUE } from '../setup/rooms';
import { defineCommand } from '../_framework/define-command';

export const resolveDropoutCommand = defineCommand({
  name: 'resolve_dropout',
  v: 1,
  schema: resolveDropoutPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rows } = await tx.query<{ organiser: boolean }>(
      `SELECT app.is_trip_organiser(d.trip_id) AS organiser FROM trip_dropouts d
        WHERE d.trip_id = $1 AND d.user_id = $2`,
      [payload.trip_id, payload.uid],
    );
    const row = rows[0];
    if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'dropout' });
    if (!row.organiser) throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ resolved_at: Date }>(
        `UPDATE trip_dropouts SET resolved_at = coalesce(resolved_at, $3),
                resolved_by = coalesce(resolved_by, $4)
          WHERE trip_id = $1 AND user_id = $2 RETURNING resolved_at`,
        [payload.trip_id, payload.uid, ctx.clock.serverNow, ctx.uid],
      );
      await sendInTx(
        tx,
        COST_RECOMPUTE_QUEUE,
        { trip_id: payload.trip_id },
        { singletonKey: payload.trip_id },
      );
      return { trip_id: payload.trip_id, uid: payload.uid, resolved_at: rows[0]?.resolved_at };
    }),
});
