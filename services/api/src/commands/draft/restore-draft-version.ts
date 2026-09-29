/**
 * `restore_draft_version` (doc delta, docs/api-contracts.md §4.6): an organiser brings back an
 * earlier private draft of the trip from its history. The earlier draft is copied into a new
 * version whose parent is the draft it replaces, so the history only ever grows.
 */
import { emitEvent } from '@cp/db';
import { DomainError, restoreDraftVersionPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { loadSetupTrip, requireOrganiser, requireStatus } from './shared';
import { copyVersion } from './versions';

export const restoreDraftVersionCommand = defineCommand({
  name: 'restore_draft_version',
  v: 1,
  schema: restoreDraftVersionPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireOrganiser(tx, payload.trip_id);
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const trip = await loadSetupTrip(tx, payload.trip_id, true);
      requireStatus(trip, ['draft_review']);
      const { rows } = await tx.query<{ draft_version_id: string | null }>(
        'SELECT draft_version_id FROM trips WHERE id = $1',
        [trip.id],
      );
      const current = rows[0]?.draft_version_id ?? null;
      const found = await tx.query(
        `SELECT 1 FROM itinerary_versions
          WHERE id = $1 AND trip_id = $2 AND visibility = 'organiser'
            AND status IN ('draft', 'superseded')`,
        [payload.version_id, trip.id],
      );
      if (found.rowCount === 0)
        throw new DomainError('NOT_FOUND', { version_id: payload.version_id });
      if (payload.version_id === current) {
        throw new DomainError('STATE_INVALID', { reason: 'already_current' });
      }
      const restored = await copyVersion(tx, payload.version_id, current);
      if (current !== null) {
        await tx.query("UPDATE itinerary_versions SET status = 'superseded' WHERE id = $1", [
          current,
        ]);
      }
      await tx.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [trip.id, restored]);
      await emitEvent(tx, {
        type: 'draft.version_restored',
        aggregateKind: 'trip',
        aggregateId: trip.id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: trip.crew_id,
        tripId: trip.id,
        payload: { trip_id: trip.id, version_id: restored, from_version_id: payload.version_id },
      });
      return { trip_id: trip.id, version_id: restored };
    }),
});
