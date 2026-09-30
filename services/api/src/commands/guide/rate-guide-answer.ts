/**
 * `rate_guide_answer` (docs/api-contracts.md §4.8): a long-press verdict on one guide answer the
 * caller can see. The verdict is kept on the message; `guide.answer_rated` carries it (with the
 * answer's trace) to the Langfuse score, never the note's text.
 */
import { emitEvent } from '@cp/db';
import { DomainError, rateGuideAnswerPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export const rateGuideAnswerCommand = defineCommand({
  name: 'rate_guide_answer',
  v: 1,
  schema: rateGuideAnswerPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rowCount } = await tx.query(
      "SELECT 1 FROM guide_messages WHERE id = $1 AND role = 'guide'",
      [payload.message_id],
    );
    if (rowCount === 0) throw new DomainError('NOT_FOUND');
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ thread_id: string; trace_id: string | null }>(
        'UPDATE guide_messages SET rating = $2 WHERE id = $1 RETURNING thread_id, trace_id',
        [payload.message_id, payload.verdict],
      );
      const rated = rows[0];
      if (rated === undefined) throw new DomainError('NOT_FOUND');
      await emitEvent(tx, {
        type: 'guide.answer_rated',
        aggregateKind: 'guide_message',
        aggregateId: payload.message_id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: {
          message_id: payload.message_id,
          thread_id: rated.thread_id,
          verdict: payload.verdict,
          trace_id: rated.trace_id,
        },
      });
      return { message_id: payload.message_id, verdict: payload.verdict };
    }),
});
