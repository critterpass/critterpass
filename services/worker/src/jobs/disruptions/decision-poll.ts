/**
 * The decision poll behind a needs-a-yes row (`kind = decision`, the crew decider policy): the
 * affected members vote APPROVE or KEEP with `cast_ballot`; the poll engine closes it as soon as the decider
 * is satisfied (any affected, the affected majority with the organiser breaking ties) or at
 * `closes_at`, which never passes the row's own deadline. Approve is the first option, which is
 * the one the decider counts as the yes.
 */
import { appendDomainEvent, armPollTimers } from '@cp/db';
import type { DisruptionDecider } from '@cp/domain';
import type pg from 'pg';

export interface DecisionPollInput {
  readonly crewId: string;
  readonly tripId: string;
  readonly question: string;
  readonly voterIds: readonly string[];
  readonly decider: DisruptionDecider;
  readonly now: Date;
  readonly approveLabel?: string;
  readonly keepLabel?: string;
}

export interface DecisionPoll {
  readonly id: string;
  readonly approve_option_id: string;
  readonly keep_option_id: string;
}

export async function openDecisionPoll(
  tx: pg.PoolClient,
  input: DecisionPollInput,
): Promise<DecisionPoll> {
  const policy = input.decider.policy === 'self' ? 'any_affected' : input.decider.policy;
  const closesAt = new Date(input.decider.closes_at);
  const minimum = new Date(input.now.getTime() + 5 * 60_000);
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO polls (crew_id, trip_id, kind, question, eligible_voter_ids, decider_policy,
       threshold, closes_at, allow_change)
     VALUES ($1, $2, 'decision', $3, $4::uuid[], $5, $6, $7, true) RETURNING id`,
    [
      input.crewId,
      input.tripId,
      input.question.slice(0, 140),
      [...new Set(input.voterIds)],
      policy,
      policy === 'threshold_n' ? input.decider.threshold : null,
      closesAt < minimum ? minimum : closesAt,
    ],
  );
  const pollId = rows[0]?.id;
  if (pollId === undefined) throw new Error('poll insert returned no row');
  const options = await tx.query<{ id: string }>(
    `INSERT INTO poll_options (poll_id, crew_id, trip_id, kind, label, position)
     VALUES ($1, $2, $3, 'text', $4, 0), ($1, $2, $3, 'text', $5, 1) RETURNING id`,
    [
      pollId,
      input.crewId,
      input.tripId,
      input.approveLabel ?? 'Approve',
      input.keepLabel ?? 'Keep',
    ],
  );
  const [approve, keep] = options.rows;
  if (approve === undefined || keep === undefined) throw new Error('poll options missing');
  await appendDomainEvent(tx, {
    type: 'poll.created',
    aggregateKind: 'poll',
    aggregateId: pollId,
    actorKind: 'system',
    actorId: null,
    payload: {
      poll_id: pollId,
      crew_id: input.crewId,
      trip_id: input.tripId,
      kind: 'decision',
      created_by: null,
    },
    crewId: input.crewId,
    tripId: input.tripId,
  });
  await armPollTimers(tx, pollId, null, closesAt < minimum ? minimum : closesAt, input.now);
  return { id: pollId, approve_option_id: approve.id, keep_option_id: keep.id };
}

/** Withdraws an open decision poll the row no longer needs. */
export async function cancelDecisionPoll(tx: pg.PoolClient, pollId: string): Promise<void> {
  const { rows } = await tx.query<{ crew_id: string; trip_id: string | null }>(
    `UPDATE polls SET status = 'cancelled', version = version + 1
      WHERE id = $1 AND status = 'open' RETURNING crew_id, trip_id`,
    [pollId],
  );
  const poll = rows[0];
  if (poll === undefined) return;
  // A timer still armed for it finds the poll no longer open and does nothing.
  await appendDomainEvent(tx, {
    type: 'poll.cancelled',
    aggregateKind: 'poll',
    aggregateId: pollId,
    actorKind: 'system',
    actorId: null,
    payload: { poll_id: pollId },
    crewId: poll.crew_id,
    ...(poll.trip_id === null ? {} : { tripId: poll.trip_id }),
  });
}
