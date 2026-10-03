/**
 * `recap.mvp_close`: closes the crew's MVP vote 72 hours after the recap was first ready, or as
 * soon as every viewer has voted (`cast_mvp_vote` queues it then). The award with the most votes
 * wins (an award its owner hid cannot); a tie shares the MVP; nobody wins a vote nobody cast. The
 * winner's card gets its gold edge on every viewer's recap through `recap:{id}` `mvp.result`.
 * Closing twice changes nothing.
 */
import { appendDomainEvent, outbox, withSystem } from '@cp/db';
import { channelName, RECAP_QUEUES, RECAP_RT, recapMvpCloseJobSchema } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export type MvpCloseOutcome = 'closed' | 'already_closed' | 'not_due' | 'no_recap';

/** Every visible award's tally, recounted from the votes, in award id order. */
export async function mvpTallies(
  tx: pg.PoolClient,
  recapId: string,
): Promise<{ award_id: string; votes: number }[]> {
  const { rows } = await tx.query<{ award_id: string; votes: number }>(
    `SELECT a.id AS award_id, count(v.id)::int AS votes
       FROM recap_awards a LEFT JOIN recap_mvp_votes v ON v.award_id = a.id
      WHERE a.recap_id = $1 AND NOT a.opted_out
      GROUP BY a.id ORDER BY a.id`,
    [recapId],
  );
  return rows;
}

export async function closeMvpVote(
  pool: pg.Pool,
  recapId: string,
  now: Date = new Date(),
): Promise<MvpCloseOutcome> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      trip_id: string;
      mvp_closes_at: Date | null;
      mvp_closed_at: Date | null;
      viewers: number;
      voters: number;
    }>(
      `SELECT r.trip_id, r.mvp_closes_at, r.mvp_closed_at,
              (SELECT count(*)::int FROM recap_views WHERE recap_id = r.id) AS viewers,
              (SELECT count(*)::int FROM recap_mvp_votes WHERE recap_id = r.id) AS voters
         FROM recaps r WHERE r.id = $1 FOR UPDATE`,
      [recapId],
    );
    const recap = rows[0];
    if (recap === undefined) return 'no_recap';
    if (recap.mvp_closed_at !== null) return 'already_closed';
    const everyoneVoted = recap.viewers > 0 && recap.voters >= recap.viewers;
    const due = recap.mvp_closes_at !== null && recap.mvp_closes_at.getTime() <= now.getTime();
    if (!everyoneVoted && !due) return 'not_due';

    const tallies = await mvpTallies(tx, recapId);
    const top = Math.max(0, ...tallies.map((tally) => tally.votes));
    const winners = top === 0 ? [] : tallies.filter((t) => t.votes === top).map((t) => t.award_id);
    await tx.query(
      `UPDATE recap_awards
          SET is_mvp = (id = ANY($2::uuid[])),
              mvp_votes = coalesce((SELECT count(*)::int FROM recap_mvp_votes v
                                     WHERE v.award_id = recap_awards.id), 0)
        WHERE recap_id = $1`,
      [recapId, winners],
    );
    await tx.query('UPDATE recaps SET mvp_closed_at = $2 WHERE id = $1', [recapId, now]);
    await outbox(tx, channelName('recap', recapId), RECAP_RT.mvpResult, {
      award_ids: winners,
      tallies,
    });
    await appendDomainEvent(tx, {
      type: 'recap.mvp_closed',
      aggregateKind: 'recap',
      aggregateId: recapId,
      actorKind: 'system',
      actorId: null,
      tripId: recap.trip_id,
      payload: { trip_id: recap.trip_id, recap_id: recapId, award_ids: winners },
    });
    return 'closed';
  });
}

export function recapMvpCloseJob(): AnyJobDefinition {
  return defineJob({
    queue: RECAP_QUEUES.mvpClose,
    schema: recapMvpCloseJobSchema,
    async handler(data, { pool }) {
      return { outcome: await closeMvpVote(pool, data.recap_id) };
    },
  });
}
