/**
 * A driver's reply from the page. It never edits the plan: the suggested order and times become a
 * change set authored by the link (an external provider, not a member) and an approval vote of the
 * crew by the money default (majority of those affected); tips are kept on the reply and shown on
 * the days without a vote. One open reply per link: a later send replaces it until the first crew
 * ballot, after which the crew's vote stands.
 */
import { appendDomainEvent } from '@cp/db';
import {
  approvalClosesAt,
  DomainError,
  generateUuidV7,
  PLAN_RT,
  type DriverPlanReplyPayload,
} from '@cp/domain';
import { driverReplyOps } from '@cp/planner';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { tripOrganiserIds, tripVoters } from '../../plan/access';
import { publishPlan } from '../../plan/changeset-store';
import { loadPlanState, lockTripPlan } from '../../plan/versioning';
import { openPoll } from '../changesets/send';
import { assertShareLive, loadShare, shareTokenHash } from './store';

export const DRIVER_REPLY_RT = 'driver_share.replied';

export interface DriverReplyOutcome {
  readonly reply_id: string;
  readonly change_set_id: string | null;
  /** True when this send replaced an earlier reply the crew had not voted on yet. */
  readonly replaced: boolean;
}

async function replacePrevious(tx: pg.PoolClient, shareId: string, now: Date): Promise<boolean> {
  const { rows } = await tx.query<{
    id: string;
    change_set_id: string | null;
    poll_id: string | null;
    votes: number;
  }>(
    `SELECT r.id, r.change_set_id, c.poll_id,
            (SELECT count(*)::int FROM ballots b WHERE b.poll_id = c.poll_id) AS votes
       FROM driver_plan_replies r LEFT JOIN change_sets c ON c.id = r.change_set_id
      WHERE r.share_id = $1 AND r.status = 'open' FOR UPDATE OF r`,
    [shareId],
  );
  const previous = rows[0];
  if (previous === undefined) return false;
  if (previous.votes > 0) throw new DomainError('STATE_INVALID', { reason: 'crew_voting' });
  await tx.query("UPDATE driver_plan_replies SET status = 'replaced' WHERE id = $1", [previous.id]);
  if (previous.change_set_id !== null) {
    await tx.query(
      "UPDATE change_sets SET status = 'rejected' WHERE id = $1 AND status IN ('proposed', 'voting')",
      [previous.change_set_id],
    );
  }
  if (previous.poll_id !== null) {
    await tx.query(
      `UPDATE polls SET status = 'cancelled', closed_at = $2, close_reason = 'manual'
        WHERE id = $1 AND status = 'open'`,
      [previous.poll_id, now],
    );
  }
  return true;
}

export async function submitDriverReply(
  tx: pg.PoolClient,
  token: string,
  payload: DriverPlanReplyPayload,
  now: Date,
): Promise<DriverReplyOutcome> {
  const share = await assertShareLive(
    tx,
    await loadShare(tx, { tokenHash: shareTokenHash(token) }, true),
    now,
  );
  if (!share.allow_quote) throw new DomainError('STATE_INVALID', { reason: 'replies_off' });
  const head = await lockTripPlan(tx, share.trip_id);
  const versionId = head.currentVersionId;
  if (versionId === null) throw new DomainError('STATE_INVALID', { reason: 'no_plan' });
  const state = await loadPlanState(tx, versionId);
  return asSystemRole(tx, async () => {
    const replaced = await replacePrevious(tx, share.id, now);
    const tz = await tx.query<{ tz: string | null }>(
      `SELECT coalesce(t.tz, d.tz) AS tz FROM trips t
         LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
      [share.trip_id],
    );
    const ops = driverReplyOps({
      state,
      dayNos: share.day_nos,
      suggestions: payload.days,
      tz: tz.rows[0]?.tz ?? 'UTC',
    });
    let changeSetId: string | null = null;
    if (ops.length > 0) {
      changeSetId = generateUuidV7();
      const voters = await tripVoters(tx, share.trip_id, head.crewId);
      const asker = share.created_by ?? (await tripOrganiserIds(tx, share.trip_id))[0];
      if (asker === undefined) throw new DomainError('STATE_INVALID', { reason: 'no_crew' });
      await tx.query(
        `INSERT INTO change_sets (id, trip_id, base_version_id, trigger, author_kind, author_id,
           status, ops)
         VALUES ($1, $2, $3, 'driver', 'provider', $4, 'proposed', $5)`,
        [changeSetId, share.trip_id, versionId, share.id, JSON.stringify(ops)],
      );
      const closesAt = approvalClosesAt({ now, inTrip: false });
      const pollId = await openPoll(
        tx,
        {
          id: changeSetId,
          trip_id: share.trip_id,
          crew_id: head.crewId,
          base_version_id: versionId,
          author_id: share.id,
          author_kind: 'user',
          status: 'proposed',
          scope: 'group',
          poll_id: null,
          ops,
          result_version_id: null,
        },
        { uid: asker, eligible: voters, policy: 'majority_of_affected', threshold: null, closesAt },
      );
      await tx.query("UPDATE change_sets SET status = 'voting', poll_id = $2 WHERE id = $1", [
        changeSetId,
        pollId,
      ]);
      await appendDomainEvent(tx, {
        type: 'change_set.proposed',
        aggregateKind: 'change_set',
        aggregateId: changeSetId,
        actorKind: 'system',
        actorId: null,
        payload: { trip_id: share.trip_id, change_set_id: changeSetId },
        crewId: head.crewId,
        tripId: share.trip_id,
      });
      await publishPlan(tx, share.trip_id, PLAN_RT.changesetSent, {
        change_set_id: changeSetId,
        poll_id: pollId,
        policy: 'majority_of_affected',
        yes: 0,
        needed: Math.floor(voters.length / 2) + 1,
        eligible: voters.length,
        closes_at: closesAt.toISOString(),
      });
    }
    const quote = payload.quote;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO driver_plan_replies (share_id, trip_id, price_per_day_minor, currency, includes,
         overtime_per_hour_minor, included_hours, car, days, tips, change_set_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        share.id,
        share.trip_id,
        quote?.price_per_day_minor ?? null,
        quote?.currency.toUpperCase() ?? null,
        quote?.includes ?? [],
        quote?.overtime_per_hour_minor ?? null,
        quote?.included_hours ?? null,
        quote?.car ?? null,
        JSON.stringify(payload.days),
        JSON.stringify(payload.tips),
        changeSetId,
      ],
    );
    const replyId = rows[0]?.id;
    if (replyId === undefined) throw new DomainError('INTERNAL');
    await publishPlan(tx, share.trip_id, DRIVER_REPLY_RT, {
      share_id: share.id,
      reply_id: replyId,
      change_set_id: changeSetId,
    });
    return { reply_id: replyId, change_set_id: changeSetId, replaced };
  });
}
