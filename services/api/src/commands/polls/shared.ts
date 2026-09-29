/**
 * Helpers the poll commands share: membership and poll visibility as the caller (RLS decides what
 * exists), the poll row lock taken as the system (it serialises ballots against a close), the
 * tally every ballot surface gets back, and the organiser check.
 */
import { loadPollState, tallyOf, type PollState } from '@cp/db';
import { DomainError, tallyWire, type PollTallyResult } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

/** The caller must be an active member of the crew; anyone else sees `NOT_FOUND`. */
export async function requireCrewMember(tx: pg.PoolClient, crewId: string): Promise<void> {
  const { rows } = await tx.query<{ member: boolean }>('SELECT app.is_crew_member($1) AS member', [
    crewId,
  ]);
  if (rows[0]?.member !== true) throw new DomainError('NOT_FOUND', { reason: 'crew' });
}

/** The poll as the caller sees it, or `NOT_FOUND` (foreign and unknown polls alike). */
export async function visiblePoll(tx: pg.PoolClient, pollId: string): Promise<PollState> {
  const state = await loadPollState(tx, pollId);
  if (state === undefined) throw new DomainError('NOT_FOUND', { reason: 'poll' });
  return state;
}

/** Re-reads the poll under its row lock, as the system (the caller already proved visibility). */
export async function lockPoll(tx: pg.PoolClient, pollId: string): Promise<PollState> {
  const state = await asSystemRole(tx, () => loadPollState(tx, pollId, 'update'));
  if (state === undefined) throw new DomainError('NOT_FOUND', { reason: 'poll' });
  return state;
}

export function tallyResult(state: PollState, uid: string): PollTallyResult {
  const wire = tallyWire(tallyOf(state));
  return {
    poll_id: state.poll.id,
    status: state.poll.status,
    stage: state.poll.stage,
    ...wire,
    my_option_id: state.ballots.find((ballot) => ballot.user_id === uid)?.option_id ?? null,
    winner_option_id: state.poll.winner_option_id,
  };
}

/** Whether ballots are still taken: open, and before the deadline (a board has none). */
export function takesBallots(state: PollState, now: Date): boolean {
  const { poll } = state;
  if (poll.status !== 'open') return false;
  return poll.stage === 'board' || poll.closes_at === null || poll.closes_at > now;
}

/** `VOTE_CLOSED` with the current result, so the surface can show it instead of an error. */
export function voteClosed(state: PollState, uid: string): DomainError {
  return new DomainError('VOTE_CLOSED', { result: tallyResult(state, uid) });
}

export async function isTripOrganiser(tx: pg.PoolClient, tripId: string | null): Promise<boolean> {
  if (tripId === null) return false;
  const { rows } = await tx.query<{ organiser: boolean }>(
    'SELECT app.is_trip_organiser($1) AS organiser',
    [tripId],
  );
  return rows[0]?.organiser === true;
}

export async function tripOrganiserIds(
  tx: pg.PoolClient,
  tripId: string | null,
): Promise<string[]> {
  if (tripId === null) return [];
  const { rows } = await tx.query<{ user_id: string }>(
    "SELECT user_id FROM trip_participants WHERE trip_id = $1 AND role = 'organiser'",
    [tripId],
  );
  return rows.map((row) => row.user_id);
}

/** The poll's creator, or an organiser of its trip, may run the poll's organiser actions. */
export async function requirePollOrganiser(
  tx: pg.PoolClient,
  state: PollState,
  uid: string,
): Promise<void> {
  if (state.poll.created_by === uid) return;
  if (await isTripOrganiser(tx, state.poll.trip_id)) return;
  throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
}

export async function activeMemberIds(tx: pg.PoolClient, crewId: string): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    "SELECT user_id FROM crew_members WHERE crew_id = $1 AND status = 'active'",
    [crewId],
  );
  return rows.map((row) => row.user_id);
}
