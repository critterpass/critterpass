/**
 * `cancel_queued_question` (doc delta, docs/api-contracts.md §4.8): the owner takes back a queued
 * question before the reset answers it; the day is free to queue another.
 */
import { emitEvent } from '@cp/db';
import { cancelQueuedQuestionPayloadSchema, DomainError } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export const cancelQueuedQuestionCommand = defineCommand({
  name: 'cancel_queued_question',
  v: 1,
  schema: cancelQueuedQuestionPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    // RLS shows a queued question to its owner only.
    const { rowCount } = await tx.query('SELECT 1 FROM queued_guide_questions WHERE id = $1', [
      payload.question_id,
    ]);
    if (rowCount === 0) throw new DomainError('NOT_FOUND');
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ id: string }>(
        `UPDATE queued_guide_questions SET status = 'cancelled'
          WHERE id = $1 AND user_id = $2 AND status = 'queued' RETURNING id`,
        [payload.question_id, ctx.uid],
      );
      if (rows[0] === undefined) throw new DomainError('STATE_INVALID', { state: 'not_queued' });
      await emitEvent(tx, {
        type: 'guide.question_cancelled',
        aggregateKind: 'queued_guide_question',
        aggregateId: payload.question_id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { question_id: payload.question_id, user_id: ctx.uid },
      });
      return { question_id: payload.question_id, status: 'cancelled' as const };
    }),
});
