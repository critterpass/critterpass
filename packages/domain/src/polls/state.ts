/**
 * Poll lifecycle (docs/data-model-sync-and-privacy.md §3.2): a poll is born `open`, then either
 * `closed` (winner set) or `cancelled`; both are terminal. Destination polls also move between
 * stages while open: the pitch board advances to a two-place final, and the organiser may reopen
 * the board. `app.polls_state_guard` (packages/db/migrations/*_polls_ballots_pitches.sql) is a
 * hand transcription of these tables; packages/db/test/permissions/polls.test.ts proves they agree.
 */
import { DomainError } from '../errors';
import { createStateMachine, type StateMachine, type Transition } from '../state/machine';
import type { PollKind, PollStage, PollStatus } from './kinds';

export const POLL_TRANSITIONS: readonly Transition<PollStatus>[] = [
  { from: null, to: 'open' },
  { from: 'open', to: 'closed' },
  { from: 'open', to: 'cancelled' },
];

export const pollStateMachine: StateMachine<PollStatus> = createStateMachine(POLL_TRANSITIONS);

export function canTransitionPoll(from: PollStatus | null, to: PollStatus): boolean {
  return pollStateMachine.canTransition(from, to);
}

/** Stage moves allowed while a destination poll is open. */
export const POLL_STAGE_TRANSITIONS: readonly (readonly [PollStage, PollStage])[] = [
  ['board', 'final'],
  ['final', 'board'],
];

export function canChangeStage(
  kind: PollKind,
  status: PollStatus,
  from: PollStage | null,
  to: PollStage | null,
): boolean {
  if (from === to) return true;
  if (kind !== 'destination' || status !== 'open' || from === null || to === null) return false;
  return POLL_STAGE_TRANSITIONS.some(([a, b]) => a === from && b === to);
}

/** The stage a new poll of `kind` starts in: destination polls open on the board. */
export function initialStage(kind: PollKind): PollStage | null {
  return kind === 'destination' ? 'board' : null;
}

/** Throws `VOTE_CLOSED` unless the poll still takes ballots. */
export function assertPollOpen(status: PollStatus): void {
  if (status !== 'open') throw new DomainError('VOTE_CLOSED', { status });
}
