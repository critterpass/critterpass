/**
 * `cast_mvp_vote {recap_id, award_id}` (offline, 3m-5): one vote per traveller, changeable until
 * the vote closes (72 hours after the recap was first ready, or once everyone voted). The tallies
 * go out live on `recap:{id}`; the last vote queues the close, which crowns the MVP for everyone.
 */
import { appendDomainEvent, outbox, sendInTx } from '@cp/db';
import {
  castMvpVotePayloadSchema,
  channelName,
  DomainError,
  RECAP_QUEUES,
  RECAP_RT,
  type CastMvpVoteResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { visibleRecap, type VisibleRecap } from './shared';

async function openRecapAndAward(
  tx: pg.PoolClient,
  recapId: string,
  awardId: string,
): Promise<VisibleRecap> {
  const recap = await visibleRecap(tx, recapId);
  if (recap.status !== 'ready') throw new DomainError('STATE_INVALID', { reason: 'not_ready' });
  const closed =
    recap.mvp_closed_at !== null ||
    (recap.mvp_closes_at !== null && recap.mvp_closes_at.getTime() <= Date.now());
  if (closed) throw new DomainError('VOTE_CLOSED', { reason: 'mvp' });
  const { rows } = await tx.query<{ opted_out: boolean }>(
    'SELECT opted_out FROM recap_awards WHERE id = $1 AND recap_id = $2',
    [awardId, recapId],
  );
  const award = rows[0];
  if (award === undefined || award.opted_out) {
    throw new DomainError('NOT_FOUND', { reason: 'award' });
  }
  return recap;
}

export const castMvpVoteCommand = defineCommand({
  name: 'cast_mvp_vote',
  v: 1,
  schema: castMvpVotePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await openRecapAndAward(tx, payload.recap_id, payload.award_id);
  },
  handle: async (tx, payload, ctx): Promise<CastMvpVoteResult> => {
    const recap = await openRecapAndAward(tx, payload.recap_id, payload.award_id);
    return asSystemRole(tx, async () => {
      await tx.query(
        `INSERT INTO recap_mvp_votes (recap_id, trip_id, voter_id, award_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (recap_id, voter_id) DO UPDATE SET award_id = EXCLUDED.award_id`,
        [recap.id, recap.trip_id, ctx.uid, payload.award_id],
      );
      const { rows: tallies } = await tx.query<{ award_id: string; votes: number }>(
        `UPDATE recap_awards a
            SET mvp_votes = (SELECT count(*)::int FROM recap_mvp_votes v WHERE v.award_id = a.id)
          WHERE a.recap_id = $1
         RETURNING a.id AS award_id, a.mvp_votes AS votes`,
        [recap.id],
      );
      const { rows: counts } = await tx.query<{ viewers: number; voters: number }>(
        `SELECT (SELECT count(*)::int FROM recap_views WHERE recap_id = $1) AS viewers,
                (SELECT count(*)::int FROM recap_mvp_votes WHERE recap_id = $1) AS voters`,
        [recap.id],
      );
      const { viewers = 1, voters = 0 } = counts[0] ?? {};
      await outbox(tx, channelName('recap', recap.id), RECAP_RT.mvpVote, {
        tallies: [...tallies].sort((a, b) => (a.award_id < b.award_id ? -1 : 1)),
        voters,
        viewers,
      });
      await appendDomainEvent(tx, {
        type: 'recap.mvp_voted',
        aggregateKind: 'recap',
        aggregateId: recap.id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: recap.trip_id,
        payload: {
          trip_id: recap.trip_id,
          recap_id: recap.id,
          voter_id: ctx.uid,
          award_id: payload.award_id,
        },
      });
      const closed = voters >= viewers;
      if (closed) {
        await sendInTx(
          tx,
          RECAP_QUEUES.mvpClose,
          { recap_id: recap.id },
          { singletonKey: `${recap.id}:everyone` },
        );
      }
      return { recap_id: recap.id, award_id: payload.award_id, closed };
    });
  },
});
