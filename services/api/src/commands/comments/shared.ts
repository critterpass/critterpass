/**
 * What the comment commands share: the comment as the caller sees it (RLS: a member of the trip's
 * crew), the author check, and the event plus `trip_plan` hint every change sends.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, PLAN_RT, type PlanEventType } from '@cp/domain';
import type pg from 'pg';

import { publishPlan } from '../../plan/changeset-store';

export interface CommentRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly anchor_kind: string;
  readonly anchor_id: string;
  readonly author_id: string;
  readonly deleted: boolean;
}

export async function visibleComment(tx: pg.PoolClient, id: string): Promise<CommentRow> {
  const { rows } = await tx.query<CommentRow>(
    `SELECT c.id, c.trip_id, t.crew_id, c.anchor_kind, c.anchor_id, c.author_id,
            c.deleted_at IS NOT NULL AS deleted
       FROM comments c JOIN trips t ON t.id = c.trip_id
      WHERE c.id = $1`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'comment' });
  return row;
}

export async function requireAuthor(tx: pg.PoolClient, id: string, uid: string): Promise<void> {
  const row = await visibleComment(tx, id);
  if (row.author_id !== uid) throw new DomainError('FORBIDDEN', { reason: 'author_only' });
}

export async function announce(
  tx: pg.PoolClient,
  row: CommentRow,
  type: Extract<PlanEventType, `comment.${string}`>,
  uid: string,
): Promise<void> {
  await appendDomainEvent(tx, {
    type,
    aggregateKind: 'comment',
    aggregateId: row.id,
    actorKind: 'user',
    actorId: uid,
    payload:
      type === 'comment.added'
        ? { trip_id: row.trip_id, comment_id: row.id, anchor_kind: row.anchor_kind }
        : type === 'comment.plusoned' || type === 'comment.unplusoned'
          ? { trip_id: row.trip_id, comment_id: row.id, user_id: uid }
          : { trip_id: row.trip_id, comment_id: row.id },
    crewId: row.crew_id,
    tripId: row.trip_id,
  });
  await publishPlan(tx, row.trip_id, PLAN_RT.commentChanged, {
    comment_id: row.id,
    anchor_kind: row.anchor_kind,
    anchor_id: row.anchor_id,
  });
}
