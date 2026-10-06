/**
 * `rate_places` (docs/api-contracts.md §4.16): a participant's verdicts on the places the trip
 * visited, in batches from the Rate the trip stack (offline queue included). A verdict can carry
 * one short tip for the next crew; the tip waits for the `compliance.check` job, which publishes
 * it anonymously on the place, holds it for ops review or turns it down. Rating a place again
 * replaces the verdict; a changed tip is screened again.
 */
import { appendDomainEvent, sendInTx } from '@cp/db';
import {
  DomainError,
  ratePlacesPayloadSchema,
  type RatePlacesResult,
  type TipStatus,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { requireTripMember } from '../../plan/access';
import { defineCommand } from '../_framework/define-command';

export const RATING_TIP_CONTENT_KIND = 'rating_tip';
const COMPLIANCE_CHECK_QUEUE = 'compliance.check';

async function retirePublishedTip(tx: pg.PoolClient, ratingId: string): Promise<void> {
  const { rows } = await tx.query<{ place_tip_id: string | null }>(
    'SELECT place_tip_id FROM ratings WHERE id = $1',
    [ratingId],
  );
  const placeTipId = rows[0]?.place_tip_id ?? null;
  if (placeTipId === null) return;
  await tx.query("UPDATE place_tips SET moderation_status = 'rejected' WHERE id = $1", [
    placeTipId,
  ]);
  await tx.query('UPDATE ratings SET place_tip_id = NULL WHERE id = $1', [ratingId]);
}

export const ratePlacesCommand = defineCommand({
  name: 'rate_places',
  v: 1,
  schema: ratePlacesPayloadSchema,
  offline: true,
  authorize: async (tx, payload, ctx) => {
    await requireTripMember(tx, payload.trip_id);
    const { rows } = await tx.query(
      'SELECT 1 FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
      [payload.trip_id, ctx.uid],
    );
    if (rows.length === 0) throw new DomainError('FORBIDDEN', { reason: 'not_participant' });
  },
  handle: (tx, payload, ctx): Promise<RatePlacesResult> =>
    asSystemRole(tx, async () => {
      const poiIds = [...new Set(payload.verdicts.map((verdict) => verdict.poi_id))];
      const { rows: known } = await tx.query<{ id: string }>(
        'SELECT id FROM pois WHERE id = ANY($1::uuid[])',
        [poiIds],
      );
      if (known.length !== poiIds.length) throw new DomainError('NOT_FOUND', { reason: 'place' });
      const tips: { poi_id: string; status: TipStatus }[] = [];
      for (const verdict of payload.verdicts) {
        const tip = verdict.tip ?? null;
        const { rows } = await tx.query<{ id: string; tip_status: TipStatus; screen: boolean }>(
          `INSERT INTO ratings (trip_id, poi_id, user_id, verdict, tip, tip_status)
           VALUES ($1, $2, $3, $4, $5, CASE WHEN $5::text IS NULL THEN 'none' ELSE 'pending' END)
           ON CONFLICT (trip_id, poi_id, user_id) DO UPDATE
              SET verdict = EXCLUDED.verdict,
                  tip = EXCLUDED.tip,
                  tip_status = CASE WHEN ratings.tip IS NOT DISTINCT FROM EXCLUDED.tip
                                    THEN ratings.tip_status ELSE EXCLUDED.tip_status END
           RETURNING id, tip_status, (tip_status = 'pending') AS screen`,
          [payload.trip_id, verdict.poi_id, ctx.uid, verdict.verdict, tip],
        );
        const row = rows[0]!;
        // A removed or changed tip takes the published one off the place at once.
        if (tip === null || row.screen) await retirePublishedTip(tx, row.id);
        if (tip === null) continue;
        tips.push({ poi_id: verdict.poi_id, status: row.tip_status });
        if (row.screen) {
          await sendInTx(
            tx,
            COMPLIANCE_CHECK_QUEUE,
            { content_kind: RATING_TIP_CONTENT_KIND, content_id: row.id },
            { singletonKey: `${RATING_TIP_CONTENT_KIND}:${row.id}` },
          );
        }
      }
      await appendDomainEvent(tx, {
        type: 'place.rated',
        aggregateKind: 'trip',
        aggregateId: payload.trip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: payload.trip_id,
        payload: {
          trip_id: payload.trip_id,
          user_id: ctx.uid,
          poi_ids: poiIds,
          tips: tips.length,
        },
      });
      return { rated: payload.verdicts.length, tips };
    }),
});
