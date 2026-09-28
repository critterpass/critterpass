/**
 * `mark_read` (docs/api-contracts.md §4.2, doc delta: keyed on `seq`): the read marker only moves
 * forward, so a late or replayed call from a device that scrolled less never un-reads anything.
 * A marker past the crew's last message is clamped to it. Former members may mark too.
 */
import { DomainError, markReadPayloadSchema, type MarkReadResult } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';

export const markReadCommand = defineCommand({
  name: 'mark_read',
  v: 1,
  schema: markReadPayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'chat_reply',
  authorize: async (tx, payload) => {
    const { rows } = await tx.query<{ reader: boolean }>(
      'SELECT app.is_crew_chat_member($1) AS reader',
      [payload.crew_id],
    );
    if (rows[0]?.reader !== true) throw new DomainError('NOT_FOUND', { reason: 'crew' });
  },
  handle: async (tx, payload, ctx): Promise<MarkReadResult> => {
    const { rows } = await tx.query<{ last_read_seq: string }>(
      `UPDATE crew_members SET last_read_seq = GREATEST(last_read_seq, LEAST($3::bigint,
         (SELECT coalesce(max(seq), 0) FROM messages WHERE crew_id = $1)))
       WHERE crew_id = $1 AND user_id = $2
       RETURNING last_read_seq`,
      [payload.crew_id, ctx.uid, payload.seq],
    );
    return { crew_id: payload.crew_id, last_read_seq: Number(rows[0]?.last_read_seq ?? 0) };
  },
});
