/**
 * `edit_queued_question` (docs/api-contracts.md §4.8): the owner rewords a queued question before
 * the reset answers it. The day, thread and answer time stay as queued; once the question is
 * answered or cancelled it can no longer change.
 */
import { DomainError, editQueuedQuestionPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export const editQueuedQuestionCommand = defineCommand({
  name: 'edit_queued_question',
  v: 1,
  schema: editQueuedQuestionPayloadSchema,
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
        `UPDATE queued_guide_questions SET text = $3
          WHERE id = $1 AND user_id = $2 AND status = 'queued' RETURNING id`,
        [payload.question_id, ctx.uid, payload.text],
      );
      if (rows[0] === undefined) throw new DomainError('STATE_INVALID', { state: 'not_queued' });
      return { question_id: payload.question_id, text: payload.text };
    }),
});
