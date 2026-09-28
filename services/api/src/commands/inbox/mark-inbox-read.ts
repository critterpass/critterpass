/**
 * `mark_inbox_read` (docs/api-contracts.md §4.3): marks the caller's items read, by id or all at
 * once. Read never resolves: a needs-you card stays on top until someone acts on it.
 */
import { appendDomainEvent } from '@cp/db';
import { markInboxReadPayloadSchema, type MarkInboxReadResult } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { publishBadgeCounts } from './shared';

export const markInboxReadCommand = defineCommand({
  name: 'mark_inbox_read',
  v: 1,
  schema: markInboxReadPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<MarkInboxReadResult> => {
    const now = ctx.clock.serverNow;
    const ids = 'item_ids' in payload ? payload.item_ids : null;
    const { rowCount } = await tx.query(
      `UPDATE inbox_items SET read_at = $3
        WHERE user_id = $1 AND read_at IS NULL AND ($2::uuid[] IS NULL OR id = ANY ($2::uuid[]))`,
      [ctx.uid, ids, now],
    );
    const count = rowCount ?? 0;
    if (count > 0) {
      await appendDomainEvent(tx, {
        type: 'inbox.read',
        aggregateKind: 'user',
        aggregateId: ctx.uid,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { user_id: ctx.uid, count },
      });
      await publishBadgeCounts(tx, ctx.uid, now);
    }
    return { count };
  },
});
