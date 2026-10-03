/**
 * `vote_idea` / `unvote_idea` (offline): ten votes per calendar month on the voter's own calendar
 * (`IDEA_VOTE_BUDGET`). `app.vote_idea` counts and inserts under the voter's own lock, so votes
 * racing from two devices can never pass the budget; an 11th vote is `STATE_INVALID{over_budget}`.
 * Taking a vote back frees it for its month again. A replay of either is a no-op.
 */
import { emitEvent } from '@cp/db';
import {
  DomainError,
  IDEA_VOTE_BUDGET,
  ideaVoteMonth,
  ideaVotesLeft,
  voteIdeaPayloadSchema,
  type VoteIdeaResult,
} from '@cp/domain';
import type pg from 'pg';

import { asServer } from '../../billing/as-server';
import { defineCommand } from '../_framework/define-command';

async function voteCounts(
  tx: pg.PoolClient,
  ideaId: string,
  uid: string,
  month: string,
): Promise<{ used: number; count: number }> {
  const { rows } = await tx.query<{ used: number; count: number | null }>(
    `SELECT (SELECT count(*)::int FROM idea_votes WHERE user_id = $2 AND month_key = $3) AS used,
            (SELECT votes_count FROM ideas WHERE id = $1) AS count`,
    [ideaId, uid, month],
  );
  return { used: rows[0]?.used ?? 0, count: rows[0]?.count ?? 0 };
}

export const voteIdeaCommand = defineCommand({
  name: 'vote_idea',
  v: 1,
  schema: voteIdeaPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: (tx, payload, ctx) =>
    asServer(tx, async (): Promise<VoteIdeaResult> => {
      const month = ideaVoteMonth(ctx.clock.effectiveClientTs, ctx.device.tz);
      const { rows } = await tx.query<{
        outcome: string;
        votes_left: number;
        votes_count: number;
      }>('SELECT * FROM app.vote_idea($1, $2, $3, $4)', [
        payload.idea_id,
        ctx.uid,
        month,
        IDEA_VOTE_BUDGET,
      ]);
      const result = rows[0];
      if (result === undefined) throw new Error('app.vote_idea returned no row');
      if (result.outcome === 'not_found') throw new DomainError('NOT_FOUND', { reason: 'idea' });
      if (result.outcome === 'over_budget') {
        throw new DomainError('STATE_INVALID', { reason: 'over_budget', budget: IDEA_VOTE_BUDGET });
      }
      if (result.outcome === 'closed') {
        throw new DomainError('STATE_INVALID', { reason: 'idea_closed' });
      }
      if (result.outcome === 'voted') {
        await emitEvent(tx, {
          type: 'idea.voted',
          aggregateKind: 'idea',
          aggregateId: payload.idea_id,
          actorKind: 'user',
          actorId: ctx.uid,
          payload: { idea_id: payload.idea_id, user_id: ctx.uid, month_key: month },
        });
      }
      return {
        idea_id: payload.idea_id,
        votes_left: result.votes_left,
        votes_count: result.votes_count,
      };
    }),
});

export const unvoteIdeaCommand = defineCommand({
  name: 'unvote_idea',
  v: 1,
  schema: voteIdeaPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: (tx, payload, ctx) =>
    asServer(tx, async (): Promise<VoteIdeaResult> => {
      const month = ideaVoteMonth(ctx.clock.effectiveClientTs, ctx.device.tz);
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('idea_votes:' || $1, 0))", [
        ctx.uid,
      ]);
      const { rows } = await tx.query<{ month_key: string }>(
        'DELETE FROM idea_votes WHERE idea_id = $1 AND user_id = $2 RETURNING month_key',
        [payload.idea_id, ctx.uid],
      );
      const removed = rows[0];
      if (removed !== undefined) {
        await emitEvent(tx, {
          type: 'idea.unvoted',
          aggregateKind: 'idea',
          aggregateId: payload.idea_id,
          actorKind: 'user',
          actorId: ctx.uid,
          payload: { idea_id: payload.idea_id, user_id: ctx.uid, month_key: removed.month_key },
        });
      }
      const counts = await voteCounts(tx, payload.idea_id, ctx.uid, month);
      return {
        idea_id: payload.idea_id,
        votes_left: ideaVotesLeft(counts.used),
        votes_count: counts.count,
      };
    }),
});
