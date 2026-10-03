/**
 * `record_rating_prompt` (offline): each time the app asked the store for a review, or held the
 * request back, so the rating rules know when it last asked (at most once in 120 days).
 */
import { emitEvent } from '@cp/db';
import { DomainError, recordRatingPromptPayloadSchema } from '@cp/domain';

import { asServer } from '../../billing/as-server';
import { defineCommand } from '../_framework/define-command';

export const recordRatingPromptCommand = defineCommand({
  name: 'record_rating_prompt',
  v: 1,
  schema: recordRatingPromptPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    if (payload.trip_id === null) return;
    const { rows } = await tx.query<{ member: boolean }>(
      'SELECT app.is_trip_member($1) AS member',
      [payload.trip_id],
    );
    if (rows[0]?.member !== true) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  },
  handle: (tx, payload, ctx) =>
    asServer(tx, async () => {
      const { rowCount } = await tx.query(
        `INSERT INTO rating_prompts (id, user_id, trip_id, shown, shown_at)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [payload.id, ctx.uid, payload.trip_id, payload.shown, ctx.clock.effectiveClientTs],
      );
      if ((rowCount ?? 0) > 0) {
        await emitEvent(tx, {
          type: 'rating.prompted',
          aggregateKind: 'rating_prompt',
          aggregateId: payload.id,
          actorKind: 'user',
          actorId: ctx.uid,
          tripId: payload.trip_id,
          payload: { user_id: ctx.uid, trip_id: payload.trip_id, shown: payload.shown },
        });
      }
      return { id: payload.id };
    }),
});
