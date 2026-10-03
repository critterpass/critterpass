/**
 * `set_place_stance` (docs/api-contracts-planning.md): WANT IT or RATHER NOT on a place in a trip,
 * with the person's own words for the crew. One row per person per place per trip: saying again
 * replaces the stance and the note (no note clears it). The event names the stance, never the
 * note; the plan check hears it and re-weighs the place.
 */
import { appendDomainEvent } from '@cp/db';
import { setPlaceStancePayloadSchema, type PlaceStanceResult } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireStanceTaker, stanceEvent } from './stance-access';

export const setPlaceStanceCommand = defineCommand({
  name: 'set_place_stance',
  v: 1,
  schema: setPlaceStancePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload) =>
    requireStanceTaker(tx, { tripId: payload.trip_id, poiId: payload.poi_id }),
  handle: async (tx, payload, ctx): Promise<PlaceStanceResult> => {
    const note = payload.note ?? null;
    const { rows } = await asSystemRole(tx, () =>
      tx.query<{ changed: boolean }>(
        `WITH before AS (
           SELECT stance, note FROM place_stances
            WHERE trip_id = $1 AND poi_id = $2 AND user_id = $3
         ), upsert AS (
           INSERT INTO place_stances (trip_id, poi_id, user_id, stance, note)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (trip_id, poi_id, user_id)
           DO UPDATE SET stance = EXCLUDED.stance, note = EXCLUDED.note
           RETURNING 1
         )
         SELECT NOT EXISTS (
           SELECT 1 FROM before WHERE stance = $4 AND note IS NOT DISTINCT FROM $5
         ) AS changed FROM upsert`,
        [payload.trip_id, payload.poi_id, ctx.uid, payload.stance, note],
      ),
    );
    if (rows[0]?.changed === true) {
      await appendDomainEvent(
        tx,
        stanceEvent('place.stance_set', ctx.uid, payload, { stance: payload.stance }),
      );
    }
    return { poi_id: payload.poi_id, stance: payload.stance };
  },
});
