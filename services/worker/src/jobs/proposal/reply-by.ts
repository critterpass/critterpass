/**
 * `proposal.reply_by` (every five minutes): a day before reply-by, the members who have not
 * answered and the organisers get N-09 (once per proposal, `reminded_at`; never for a proposal
 * sent with under a day to answer, whose own push just went out); at reply-by the proposal
 * locks, everyone unanswered stays MAYBE and the organisers are told. Idempotent per proposal: each
 * step is guarded by its own column and taken under a row lock that skips a proposal in flight.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import { PROPOSAL_QUEUES, REPLY_BY_REMINDER_LEAD_H } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

const REMINDER_LEAD_MS = REPLY_BY_REMINDER_LEAD_H * 3_600_000;

interface DueProposal {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly reply_by: Date;
  readonly sent_at: Date | null;
  readonly reminded_at: Date | null;
}

const UNANSWERED = `SELECT v.recipient_id AS user_id FROM proposal_versions v
   LEFT JOIN trip_participants tp ON tp.trip_id = v.trip_id AND tp.user_id = v.recipient_id
  WHERE v.proposal_id = $1 AND coalesce(tp.rsvp, 'unopened') IN ('unopened', 'opened')`;

export async function runReplyBy(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<{ reminded: number; locked: number }> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<DueProposal>(
      `SELECT p.id, p.trip_id, t.crew_id, p.reply_by, p.sent_at, p.reminded_at FROM proposals p
         JOIN trips t ON t.id = p.trip_id
        WHERE p.status = 'sent' AND p.reply_by - make_interval(hours => $2) <= $1
        FOR UPDATE OF p SKIP LOCKED`,
      [now, REPLY_BY_REMINDER_LEAD_H],
    );
    let reminded = 0;
    let locked = 0;
    for (const proposal of rows) {
      const base = { trip_id: proposal.trip_id, proposal_id: proposal.id };
      const event = {
        aggregateKind: 'proposal',
        aggregateId: proposal.id,
        actorKind: 'system' as const,
        actorId: null,
        crewId: proposal.crew_id,
        tripId: proposal.trip_id,
      };
      if (proposal.reply_by.getTime() <= now.getTime()) {
        const unanswered = await tx.query<{ user_id: string }>(UNANSWERED, [proposal.id]);
        await tx.query(
          `UPDATE trip_participants SET rsvp = 'maybe'
            WHERE trip_id = $1 AND user_id = ANY ($2::uuid[]) AND rsvp IN ('unopened', 'opened')`,
          [proposal.trip_id, unanswered.rows.map((r) => r.user_id)],
        );
        await tx.query(`UPDATE proposals SET status = 'locked', locked_at = $2 WHERE id = $1`, [
          proposal.id,
          now,
        ]);
        await appendDomainEvent(tx, {
          ...event,
          type: 'proposal.locked',
          payload: { ...base, unanswered: unanswered.rows.length },
        });
        locked += 1;
      } else if (
        proposal.reminded_at === null &&
        proposal.sent_at !== null &&
        proposal.reply_by.getTime() - proposal.sent_at.getTime() < REMINDER_LEAD_MS
      ) {
        // A last-minute proposal (under a day to answer) was just pushed to everyone: no second
        // push on its heels. The reminder is marked done so the proposal is not looked at again.
        await tx.query('UPDATE proposals SET reminded_at = $2 WHERE id = $1', [proposal.id, now]);
      } else if (proposal.reminded_at === null) {
        const unanswered = await tx.query<{ user_id: string }>(UNANSWERED, [proposal.id]);
        const organisers = await tx.query<{ user_id: string }>(
          `SELECT user_id FROM trip_participants WHERE trip_id = $1 AND role = 'organiser'`,
          [proposal.trip_id],
        );
        const userIds = [
          ...new Set([...unanswered.rows, ...organisers.rows].map((r) => r.user_id)),
        ];
        await tx.query('UPDATE proposals SET reminded_at = $2 WHERE id = $1', [proposal.id, now]);
        await appendDomainEvent(tx, {
          ...event,
          type: 'proposal.reply_by_soon',
          payload: { ...base, user_ids: userIds },
        });
        reminded += 1;
      }
    }
    return { reminded, locked };
  });
}

export function replyByJob(): AnyJobDefinition {
  return defineJob({
    queue: PROPOSAL_QUEUES.replyBy,
    schema: z.object({}).nullish(),
    async handler(_data, { pool }) {
      return { ...(await runReplyBy(pool)) };
    },
  });
}
