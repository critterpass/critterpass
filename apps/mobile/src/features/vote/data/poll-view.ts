/**
 * What every poll surface draws, from synced rows plus this device's queued ballot commands: the
 * options with their counts and voters, the viewer's own choice, how many are still to vote and
 * whether the poll still takes ballots. A queued ballot replaces the viewer's synced one at once,
 * so a vote cast offline shows straight away and is counted once when it syncs.
 */
import { computeTally, type PollKind, type PollStage, type PollStatus } from '@cp/domain';

export interface PollRow {
  readonly id: string;
  readonly crew_id: string;
  readonly trip_id: string | null;
  readonly kind: PollKind;
  readonly stage: PollStage | null;
  readonly status: PollStatus;
  readonly question: string | null;
  readonly created_by: string | null;
  /** JSON array text (synced `uuid[]`). */
  readonly eligible_voter_ids: string | null;
  readonly closes_at: string | null;
  readonly allow_change: number | null;
  readonly winner_option_id: string | null;
  /** JSON object text. */
  readonly result: string | null;
  readonly closed_at: string | null;
}

export interface OptionRow {
  readonly id: string;
  readonly label: string;
  readonly position: number;
  readonly ref_id: string | null;
  readonly pitch_id: string | null;
  readonly proposed_by: string | null;
  readonly eliminated_at: string | null;
}

export interface BallotRow {
  readonly option_id: string;
  readonly user_id: string;
  readonly cast_at: string;
}

/** A queued `cast_ballot` (option id) or `retract_ballot` (null) of the viewer, oldest first. */
export interface PendingBallot {
  readonly cmd: 'cast_ballot' | 'retract_ballot';
  readonly option_id: string | null;
  readonly created_at: string;
}

export interface PollOptionView {
  readonly id: string;
  readonly label: string;
  readonly refId: string | null;
  readonly pitchId: string | null;
  readonly proposedBy: string | null;
  readonly votes: number;
  readonly voterIds: readonly string[];
  readonly mine: boolean;
  readonly winner: boolean;
}

export interface TiePreview {
  readonly winnerOptionId: string;
  readonly cheaperByMinor: number;
  readonly currency: string;
  readonly origin: string;
  readonly memberCount: number;
}

export interface PollView {
  readonly id: string;
  readonly crewId: string;
  readonly tripId: string | null;
  readonly kind: PollKind;
  readonly stage: PollStage | null;
  readonly status: PollStatus;
  readonly question: string | null;
  readonly createdBy: string | null;
  readonly options: readonly PollOptionView[];
  readonly myOptionId: string | null;
  /** The viewer's vote is still in the upload queue. */
  readonly myVoteQueued: boolean;
  readonly eligibleIds: readonly string[];
  readonly pendingIds: readonly string[];
  readonly votedCount: number;
  readonly canVote: boolean;
  readonly allowChange: boolean;
  readonly closesAt: string | null;
  readonly winnerOptionId: string | null;
  /** Which finalist a tie goes to (destination final). */
  readonly tiePreview: TiePreview | null;
  /** How the tie was broken at close, when it was. */
  readonly tieBreak: TiePreview | null;
}

function parseIds(text: string | null): string[] {
  if (text === null || text === '') return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    // Postgres array literal `{a,b}` (older sync payloads).
    return text
      .replace(/^\{|\}$/gu, '')
      .split(',')
      .filter((id) => id.length > 0);
  }
}

function parseTie(value: unknown): TiePreview | null {
  if (typeof value !== 'object' || value === null) return null;
  const tie = value as Record<string, unknown>;
  if (
    tie['rule'] !== 'cheaper_for_majority_origin' ||
    typeof tie['winner_option_id'] !== 'string'
  ) {
    return null;
  }
  const text = (key: string, fallback: string) =>
    typeof tie[key] === 'string' ? (tie[key]) : fallback;
  return {
    winnerOptionId: tie['winner_option_id'],
    cheaperByMinor: Number(tie['cheaper_by_minor'] ?? 0),
    currency: text('currency', 'USD'),
    origin: text('origin', ''),
    memberCount: Number(tie['member_count'] ?? 0),
  };
}

function parseResult(text: string | null): Record<string, unknown> {
  if (text === null) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function pollView(
  poll: PollRow,
  optionRows: readonly OptionRow[],
  ballotRows: readonly BallotRow[],
  pending: readonly PendingBallot[],
  me: string,
  now: Date,
): PollView {
  const eligibleIds = parseIds(poll.eligible_voter_ids);
  const last = pending[pending.length - 1];
  const open = poll.status === 'open';
  const ballots = ballotRows
    .filter((ballot) => !(open && last !== undefined && ballot.user_id === me))
    .map((ballot) => ({
      optionId: ballot.option_id,
      userId: ballot.user_id,
      castAt: new Date(ballot.cast_at),
    }));
  if (open && last?.cmd === 'cast_ballot' && last.option_id !== null) {
    ballots.push({ optionId: last.option_id, userId: me, castAt: new Date(last.created_at) });
  }
  const tally = computeTally({
    options: optionRows.map((row) => ({
      id: row.id,
      position: row.position,
      eliminated: row.eliminated_at !== null,
    })),
    ballots,
    eligibleVoterIds: eligibleIds,
  });
  const myOptionId = ballots.find((ballot) => ballot.userId === me)?.optionId ?? null;
  const byId = new Map(optionRows.map((row) => [row.id, row]));
  const result = parseResult(poll.result);
  const beforeDeadline =
    poll.stage === 'board' || poll.closes_at === null || new Date(poll.closes_at) > now;
  return {
    id: poll.id,
    crewId: poll.crew_id,
    tripId: poll.trip_id,
    kind: poll.kind,
    stage: poll.stage,
    status: poll.status,
    question: poll.question,
    createdBy: poll.created_by,
    options: tally.options.map((option) => {
      const row = byId.get(option.optionId);
      return {
        id: option.optionId,
        label: row?.label ?? '',
        refId: row?.ref_id ?? null,
        pitchId: row?.pitch_id ?? null,
        proposedBy: row?.proposed_by ?? null,
        votes: option.count,
        voterIds: option.voterIds,
        mine: option.optionId === myOptionId,
        winner: option.optionId === poll.winner_option_id,
      };
    }),
    myOptionId,
    myVoteQueued: pending.length > 0,
    eligibleIds,
    pendingIds: tally.pendingVoterIds,
    votedCount: tally.total,
    canVote: open && beforeDeadline && eligibleIds.includes(me),
    allowChange: poll.allow_change !== 0,
    closesAt: poll.closes_at,
    winnerOptionId: poll.winner_option_id,
    tiePreview: parseTie(result['tie_preview']),
    tieBreak: parseTie(result['tie']),
  };
}
