/** `edit_comment` (doc delta): the author rewrites their comment; a deleted one stays deleted. */
import { DomainError, editCommentPayloadSchema } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { announce, requireAuthor, visibleComment } from './shared';

export const editCommentCommand = defineCommand({
  name: 'edit_comment',
  v: 1,
  schema: editCommentPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload, ctx) => requireAuthor(tx, payload.comment_id, ctx.uid),
  handle: async (tx, payload, ctx): Promise<{ comment_id: string }> => {
    const row = await visibleComment(tx, payload.comment_id);
    if (row.deleted) throw new DomainError('STATE_INVALID', { state: 'deleted' });
    await tx.query('UPDATE comments SET body = $2, edited_at = $3 WHERE id = $1', [
      row.id,
      payload.body,
      ctx.clock.serverNow,
    ]);
    await announce(tx, row, 'comment.edited', ctx.uid);
    return { comment_id: row.id };
  },
});
