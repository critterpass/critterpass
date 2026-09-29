/**
 * The poll engine's database half, shared by the api's poll commands and the worker's poll jobs:
 * load a poll with its options and ballots (optionally locked), tally it, and publish the tally
 * hint. Writers call these as `app_system` after their own checks; the poll row lock taken here
 * is what serialises a ballot against a close at the deadline.
 */
import {
  channelName,
  computeTally,
  tallyWire,
  type PollDeciderPolicy,
  type PollKind,
  type PollStage,
  type PollStatus,
  type PollTieRule,
  type Tally,
} from '@cp/domain';
import type pg from 'pg';

import { outbox } from '../command/outbox';

export interface PollRow {
  readonly id: string;
  readonly crew_id: string;
  readonly trip_id: string | null;
  readonly kind: PollKind;
  readonly stage: PollStage | null;
  readonly status: PollStatus;
  readonly question: string | null;
  readonly created_by: string | null;
  readonly eligible_voter_ids: string[];
  readonly decider_policy: PollDeciderPolicy | null;
  readonly threshold: number | null;
  readonly closes_at: Date | null;
  readonly allow_change: boolean;
  readonly tie_rule: PollTieRule;
  readonly winner_option_id: string | null;
  readonly result: Record<string, unknown> | null;
  readonly closed_at: Date | null;
  readonly version: number;
}

export interface PollOptionRow {
  readonly id: string;
  readonly kind: string;
  readonly ref_id: string | null;
  readonly label: string;
  readonly frozen_quote_id: string | null;
  readonly pitch_id: string | null;
  readonly proposed_by: string | null;
  readonly position: number;
  readonly eliminated_at: Date | null;
}

export interface BallotRow {
  readonly option_id: string;
  readonly user_id: string;
  readonly source: string;
  readonly cast_at: Date;
}

export interface PollState {
  readonly poll: PollRow;
  readonly options: readonly PollOptionRow[];
  readonly ballots: readonly BallotRow[];
}

const POLL_COLUMNS = `id, crew_id, trip_id, kind, stage, status, question, created_by,
  eligible_voter_ids, decider_policy, threshold, closes_at, allow_change, tie_rule,
  winner_option_id, result, closed_at, version`;

/** The poll as the current role sees it, or `undefined`; `lock` takes the row lock first. */
export async function loadPollState(
  tx: pg.PoolClient,
  pollId: string,
  lock: 'update' | 'share' | 'none' = 'none',
): Promise<PollState | undefined> {
  const suffix = lock === 'update' ? ' FOR UPDATE' : lock === 'share' ? ' FOR SHARE' : '';
  const { rows } = await tx.query<PollRow>(
    `SELECT ${POLL_COLUMNS} FROM polls WHERE id = $1${suffix}`,
    [pollId],
  );
  const poll = rows[0];
  if (poll === undefined) return undefined;
  const options = await tx.query<PollOptionRow>(
    `SELECT id, kind, ref_id, label, frozen_quote_id, pitch_id, proposed_by, position, eliminated_at
       FROM poll_options WHERE poll_id = $1 ORDER BY position, created_at`,
    [pollId],
  );
  const ballots = await tx.query<BallotRow>(
    'SELECT option_id, user_id, source, cast_at FROM ballots WHERE poll_id = $1',
    [pollId],
  );
  return { poll, options: options.rows, ballots: ballots.rows };
}

export function tallyOf(state: PollState): Tally {
  return computeTally({
    options: state.options.map((option) => ({
      id: option.id,
      position: option.position,
      eliminated: option.eliminated_at !== null,
    })),
    ballots: state.ballots.map((ballot) => ({
      optionId: ballot.option_id,
      userId: ballot.user_id,
      castAt: ballot.cast_at,
    })),
    eligibleVoterIds: state.poll.eligible_voter_ids,
  });
}

/** Live options in board order. */
export function optionOrder(state: PollState): string[] {
  return state.options.filter((option) => option.eliminated_at === null).map((option) => option.id);
}

export type PollHintType = 'ballot.upserted' | 'poll.updated' | 'poll.closed';

/**
 * Realtime hints for one poll change: `poll:{id}` for open poll screens and the chat mirror
 * `poll.tally` on `crew_chat:{crew}` for the chat card. Counts only; rows arrive through sync.
 */
export async function publishPollHints(
  tx: pg.PoolClient,
  state: PollState,
  tally: Tally,
  type: PollHintType,
  extra: Readonly<Record<string, unknown>> = {},
): Promise<void> {
  const wire = { poll_id: state.poll.id, ...tallyWire(tally), ...extra };
  await outbox(tx, channelName('poll', state.poll.id), type, wire);
  await outbox(tx, channelName('crew_chat', state.poll.crew_id), 'poll.tally', wire);
}
