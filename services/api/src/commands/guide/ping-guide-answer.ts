/**
 * `ping_guide_answer`: "Ping me" on a slow guide answer. The caller is leaving the guide while it
 * is still working; the answer keeps going without them and, when it is saved, they get a push
 * (`guide.answer_ready`). Online only: a ping for an answer being written now means nothing later.
 * Asking twice is the same ping.
 */
import { DomainError, pingGuideAnswerPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export const pingGuideAnswerCommand = defineCommand({
  name: 'ping_guide_answer',
  v: 1,
  schema: pingGuideAnswerPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    // Through the caller's own row security: a thread they can read.
    const { rowCount } = await tx.query('SELECT 1 FROM guide_threads WHERE id = $1', [
      payload.thread_id,
    ]);
    if (rowCount === 0) throw new DomainError('NOT_FOUND');
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      await tx.query(
        `INSERT INTO guide_answer_pings (thread_id, user_id) VALUES ($1, $2)
         ON CONFLICT (thread_id, user_id) DO UPDATE SET requested_at = now()`,
        [payload.thread_id, ctx.uid],
      );
      return { thread_id: payload.thread_id };
    }),
});
