/**
 * `delete_comment` (doc delta): the author deletes their comment. It stays as a tombstone (body
 * cleared) so replies and +1 counts around it keep their place; deleting twice changes nothing.
 */
import { commentIdPayloadSchema } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { announce, requireAuthor, visibleComment } from './shared';

export const deleteCommentCommand = defineCommand({
  name: 'delete_comment',
  v: 1,
  schema: commentIdPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload, ctx) => requireAuthor(tx, payload.comment_id, ctx.uid),
  handle: async (tx, payload, ctx): Promise<{ comment_id: string }> => {
    const row = await visibleComment(tx, payload.comment_id);
    if (row.deleted) return { comment_id: row.id };
    await tx.query("UPDATE comments SET body = '', deleted_at = $2 WHERE id = $1", [
      row.id,
      ctx.clock.serverNow,
    ]);
    await announce(tx, row, 'comment.deleted', ctx.uid);
    return { comment_id: row.id };
  },
});
