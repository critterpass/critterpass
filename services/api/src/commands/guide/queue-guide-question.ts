/**
 * `queue_guide_question` (docs/api-contracts.md §4.8): ASK AT MIDNIGHT on the 4b-1 limit card. Only
 * while today's free answers are spent; the question waits for the meter's reset (the next local
 * midnight of the day that ran out) and is answered then, counting toward the new day. One
 * question per user per day; a cancelled one frees the day.
 */
import { emitEvent } from '@cp/db';
import { canQueueQuestion, DomainError, queueGuideQuestionPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

interface MeterRow {
  readonly count: number;
  readonly limit_at_time: number;
  readonly period_key: string;
  readonly reset_at: Date;
}

export const queueGuideQuestionCommand = defineCommand({
  name: 'queue_guide_question',
  v: 1,
  schema: queueGuideQuestionPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rowCount } = await tx.query('SELECT 1 FROM guide_threads WHERE id = $1', [
      payload.thread_id,
    ]);
    if (rowCount === 0) throw new DomainError('NOT_FOUND');
  },
  handle: async (tx, payload, ctx) => {
    const { rows: meter } = await tx.query<MeterRow>(
      `SELECT count, limit_at_time, period_key, reset_at FROM usage_counters
        WHERE subject_kind = 'user' AND subject_id = $1 AND metric = 'guide_answers'
          AND reset_at > now()
        ORDER BY started_at DESC LIMIT 1`,
      [ctx.uid],
    );
    const today = meter[0];
    if (
      today === undefined ||
      !canQueueQuestion({ count: today.count, limit: today.limit_at_time })
    ) {
      throw new DomainError('STATE_INVALID', { state: 'answers_left' });
    }
    return asSystemRole(tx, async () => {
      const { rows: thread } = await tx.query<{ trip_id: string | null }>(
        'SELECT trip_id FROM guide_threads WHERE id = $1',
        [payload.thread_id],
      );
      const { rows } = await tx.query<{ id: string; answer_after: Date }>(
        `INSERT INTO queued_guide_questions
           (user_id, thread_id, trip_id, text, tz, queued_for, answer_after)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, queued_for) WHERE status <> 'cancelled' DO NOTHING
         RETURNING id, answer_after`,
        [
          ctx.uid,
          payload.thread_id,
          thread[0]?.trip_id ?? null,
          payload.text,
          ctx.device.tz,
          today.period_key,
          today.reset_at,
        ],
      );
      const queued = rows[0];
      if (queued === undefined) throw new DomainError('STATE_INVALID', { state: 'already_queued' });
      await emitEvent(tx, {
        type: 'guide.question_queued',
        aggregateKind: 'queued_guide_question',
        aggregateId: queued.id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: {
          question_id: queued.id,
          user_id: ctx.uid,
          thread_id: payload.thread_id,
          answer_after: queued.answer_after.toISOString(),
        },
      });
      return { question_id: queued.id, answer_after: queued.answer_after.toISOString() };
    });
  },
});
