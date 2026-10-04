/**
 * `clear_place_stance` (docs/api-contracts-planning.md): take back where you stood on a place, in
 * one tap. Clearing a stance that is not there is a no-op with no event.
 */
import { appendDomainEvent } from '@cp/db';
import { clearPlaceStancePayloadSchema, type PlaceStanceResult } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireStanceTaker, stanceEvent } from './stance-access';

export const clearPlaceStanceCommand = defineCommand({
  name: 'clear_place_stance',
  v: 1,
  schema: clearPlaceStancePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload) =>
    requireStanceTaker(tx, { tripId: payload.trip_id, poiId: payload.poi_id }),
  handle: async (tx, payload, ctx): Promise<PlaceStanceResult> => {
    const removed = await asSystemRole(tx, () =>
      tx.query('DELETE FROM place_stances WHERE trip_id = $1 AND poi_id = $2 AND user_id = $3', [
        payload.trip_id,
        payload.poi_id,
        ctx.uid,
      ]),
    );
    if ((removed.rowCount ?? 0) > 0) {
      await appendDomainEvent(tx, stanceEvent('place.stance_cleared', ctx.uid, payload));
    }
    return { poi_id: payload.poi_id, stance: null };
  },
});
