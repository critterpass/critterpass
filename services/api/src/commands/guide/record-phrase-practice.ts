/**
 * `record_phrase_practice` (docs/api-contracts.md §4.8): the traveller practised a phrase card
 * (a curated one or their own custom card). Every attempt is counted on `phrase_progress`; a
 * practice that went well stamps `practised_at` and, inside a trip, emits `phrase.practised`, which
 * the quest evaluator reads. Practice never touches the guide meter.
 */
import { emitEvent } from '@cp/db';
import { DomainError, recordPhrasePracticePayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export const recordPhrasePracticeCommand = defineCommand({
  name: 'record_phrase_practice',
  v: 1,
  schema: recordPhrasePracticePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    if (payload.trip_id === null) return;
    const { rows } = await tx.query<{ member: boolean }>(
      'SELECT app.is_trip_member($1) AS member',
      [payload.trip_id],
    );
    if (rows[0]?.member !== true) throw new DomainError('NOT_FOUND');
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      // A card anyone may read (a live curated card) or the caller's own custom card.
      const { rows: cards } = await tx.query(
        `SELECT 1 FROM phrase_cards WHERE id = $1 AND app.is_live_release(release_id)
         UNION ALL
         SELECT 1 FROM custom_phrase_cards WHERE id = $1 AND user_id = $2`,
        [payload.phrase_id, ctx.uid],
      );
      if (cards.length === 0) throw new DomainError('NOT_FOUND', { reason: 'phrase' });
      const ok = payload.outcome === 'ok';
      const { rows } = await tx.query<{ attempts: number; practised: boolean }>(
        `INSERT INTO phrase_progress (user_id, phrase_id, attempts, score, practised_at)
         VALUES ($1, $2, 1, $3, CASE WHEN $4 THEN now() END)
         ON CONFLICT ON CONSTRAINT phrase_progress_user_phrase_key DO UPDATE
           SET attempts = phrase_progress.attempts + 1,
               score = COALESCE(GREATEST(phrase_progress.score, EXCLUDED.score), phrase_progress.score, EXCLUDED.score),
               practised_at = COALESCE(EXCLUDED.practised_at, phrase_progress.practised_at)
         RETURNING attempts, practised_at IS NOT NULL AS practised`,
        [ctx.uid, payload.phrase_id, payload.score ?? null, ok],
      );
      if (ok && payload.trip_id !== null) {
        await emitEvent(tx, {
          type: 'phrase.practised',
          aggregateKind: 'phrase_progress',
          aggregateId: payload.phrase_id,
          actorKind: 'user',
          actorId: ctx.uid,
          tripId: payload.trip_id,
          payload: {
            phrase_id: payload.phrase_id,
            trip_id: payload.trip_id,
            user_id: ctx.uid,
            language: payload.language,
          },
        });
      }
      return { attempts: rows[0]?.attempts ?? 1, practised: rows[0]?.practised ?? ok };
    }),
});
