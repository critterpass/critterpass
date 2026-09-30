/**
 * `add_comment` (docs/api-contracts.md §4.2): a member comments on a plan item (by stable id, so the
 * thread survives new versions), a poll option, a day or a place inside a decision option. The
 * anchor must exist on the trip.
 */
import { addCommentPayloadSchema, DomainError, generateUuidV7 } from '@cp/domain';
import type pg from 'pg';

import { requireTripMember } from '../../plan/access';
import { defineCommand } from '../_framework/define-command';
import { announce, visibleComment } from './shared';

async function anchorExists(
  tx: pg.PoolClient,
  tripId: string,
  kind: string,
  id: string,
): Promise<boolean> {
  const sql: Record<string, string> = {
    item: 'SELECT 1 FROM plan_items WHERE trip_id = $1 AND stable_id = $2::uuid LIMIT 1',
    option: `SELECT 1 FROM poll_options o JOIN polls p ON p.id = o.poll_id
              WHERE p.trip_id = $1 AND o.id = $2::uuid`,
    day: `SELECT 1 FROM plan_days d JOIN trips t ON t.current_version_id = d.version_id
           WHERE t.id = $1 AND d.day_no = $2::int`,
    poi_in_option: `SELECT 1 FROM poll_options o JOIN polls p ON p.id = o.poll_id
                     WHERE p.trip_id = $1 AND o.id = split_part($2, ':', 1)::uuid`,
  };
  const query = sql[kind];
  if (query === undefined) return false;
  return ((await tx.query(query, [tripId, id])).rowCount ?? 0) > 0;
}

export const addCommentCommand = defineCommand({
  name: 'add_comment',
  v: 1,
  schema: addCommentPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireTripMember(tx, payload.trip_id);
  },
  handle: async (tx, payload, ctx): Promise<{ comment_id: string }> => {
    const id = payload.comment_id ?? generateUuidV7();
    const existing = await tx.query('SELECT 1 FROM comments WHERE id = $1', [id]);
    if ((existing.rowCount ?? 0) > 0) return { comment_id: id };
    if (!(await anchorExists(tx, payload.trip_id, payload.target.kind, payload.target.id))) {
      throw new DomainError('NOT_FOUND', { reason: 'anchor' });
    }
    // As the member: RLS lets a member of the trip's crew comment in their own name only.
    await tx.query(
      `INSERT INTO comments (id, trip_id, anchor_kind, anchor_id, author_id, body)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, payload.trip_id, payload.target.kind, payload.target.id, ctx.uid, payload.body],
    );
    await announce(tx, await visibleComment(tx, id), 'comment.added', ctx.uid);
    return { comment_id: id };
  },
});
