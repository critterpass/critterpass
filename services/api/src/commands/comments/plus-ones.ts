/**
 * `plusone_comment` / `unplusone_comment` (docs/api-contracts.md §4.2, doc delta): a member backs a
 * crewmate's comment ("+1 from Rin"), once, and can take it back. Not on their own comment and not
 * on a deleted one; repeating either changes nothing.
 */
import { commentIdPayloadSchema, DomainError } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { announce, visibleComment } from './shared';

export const plusoneCommentCommand = defineCommand({
  name: 'plusone_comment',
  v: 1,
  schema: commentIdPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await visibleComment(tx, payload.comment_id);
  },
  handle: async (tx, payload, ctx): Promise<{ comment_id: string; plus_one: boolean }> => {
    const row = await visibleComment(tx, payload.comment_id);
    if (row.author_id === ctx.uid)
      throw new DomainError('STATE_INVALID', { reason: 'own_comment' });
    if (row.deleted) throw new DomainError('STATE_INVALID', { state: 'deleted' });
    // As the member: RLS lets them +1 in their own name only.
    const { rowCount } = await tx.query(
      `INSERT INTO comment_plus_ones (comment_id, user_id) VALUES ($1, $2)
       ON CONFLICT (comment_id, user_id) DO NOTHING`,
      [row.id, ctx.uid],
    );
    if ((rowCount ?? 0) > 0) await announce(tx, row, 'comment.plusoned', ctx.uid);
    return { comment_id: row.id, plus_one: true };
  },
});

export const unplusoneCommentCommand = defineCommand({
  name: 'unplusone_comment',
  v: 1,
  schema: commentIdPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await visibleComment(tx, payload.comment_id);
  },
  handle: async (tx, payload, ctx): Promise<{ comment_id: string; plus_one: boolean }> => {
    const row = await visibleComment(tx, payload.comment_id);
    const { rowCount } = await asSystemRole(tx, () =>
      tx.query('DELETE FROM comment_plus_ones WHERE comment_id = $1 AND user_id = $2', [
        row.id,
        ctx.uid,
      ]),
    );
    if ((rowCount ?? 0) > 0) await announce(tx, row, 'comment.unplusoned', ctx.uid);
    return { comment_id: row.id, plus_one: false };
  },
});
