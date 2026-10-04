/**
 * Deciding a change set's approval vote after a ballot lands, whoever cast it: the author's own
 * yes when they send it, or an affected member's answer. An approved set applies at once unless a
 * booking waits for the organiser; a rejected one keeps the plan; anything else stays open.
 */
import { loadPollState } from '@cp/db';
import { ballotSourceForVia, type PollDeciderPolicy } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import {
  advance,
  applyToGroup,
  closeVote,
  rejectChangeSet,
  tallyOfPoll,
  type ChangeSetRow,
} from './changeset-store';
import { verdict, type Verdict } from './decider-policy';
import { bookingImpactOf } from './providers';

export interface VoteRules {
  readonly policy: PollDeciderPolicy;
  readonly threshold: number | null;
  readonly eligible: readonly string[];
  readonly organiserIds: readonly string[];
}

/** The voter's first ballot, written as the voter: RLS (`app.can_vote`) backs eligibility up. */
export async function castFirstBallot(
  tx: pg.PoolClient,
  row: ChangeSetRow,
  ballot: {
    readonly pollId: string;
    readonly optionId: string | null;
    readonly uid: string;
    readonly via: string;
    readonly opId: string;
    readonly now: Date;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO ballots (poll_id, option_id, crew_id, user_id, source, op_id, cast_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      ballot.pollId,
      ballot.optionId,
      row.crew_id,
      ballot.uid,
      ballotSourceForVia(ballot.via),
      ballot.opId,
      ballot.now,
    ],
  );
}

/** Reads the tally as it now stands and closes the vote when it is decided. */
export async function settleVote(
  tx: pg.PoolClient,
  row: ChangeSetRow,
  input: {
    readonly pollId: string;
    readonly rules: VoteRules;
    readonly uid: string;
    readonly tieBreak?: 'yes' | 'no';
  },
): Promise<Verdict> {
  const state = await asSystemRole(tx, () => loadPollState(tx, input.pollId));
  if (state === undefined) return 'pending';
  const tally = tallyOfPoll(state);
  const result = verdict({
    ...input.rules,
    yes: tally.yes,
    no: tally.no,
    ...(input.tieBreak === undefined ? {} : { tieBreak: input.tieBreak }),
  });
  if (result === 'approve') {
    await closeVote(tx, row, 'approve', 'decider', input.uid);
    const approved = await advance(tx, row, ['approved'], {
      kind: input.tieBreak === undefined ? 'vote' : 'organiser',
      uid: input.uid,
    });
    const impact = await bookingImpactOf(tx, approved);
    if (!impact.needsOrganiser) await applyToGroup(tx, approved, { kind: 'system', id: null });
  } else if (result === 'reject') {
    await closeVote(tx, row, 'reject', 'decider', input.uid);
    await rejectChangeSet(tx, row, input.uid);
  }
  return result;
}
