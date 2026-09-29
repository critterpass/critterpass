/**
 * Who may vote (the eligible snapshot taken at creation, docs/data-model.md §3.3): active crew
 * members for crew polls and for the destination vote (the trip is born from it, so nobody holds a
 * seat yet), seat holders for other trip polls, the affected members for approvals. A member who
 * joins later is added only while a destination board is open; a member who leaves is removed and
 * their ballot with them, so the denominator shrinks.
 */
import type { PollKind, PollStage } from './kinds';

export interface EligibilityInput {
  readonly kind: PollKind;
  readonly tripId: string | null;
  readonly activeMemberIds: readonly string[];
  /** Trip participants holding a seat (RSVP neither `out` nor waitlisted). */
  readonly seatHolderIds?: readonly string[];
  /** Approvals and decisions: the members the change touches; empty = everyone eligible. */
  readonly affectedUserIds?: readonly string[];
}

const uniqueSorted = (ids: readonly string[]): string[] => [...new Set(ids)].sort();

export function initialEligibleVoters(input: EligibilityInput): string[] {
  const members = new Set(input.activeMemberIds);
  const onlyMembers = (ids: readonly string[]) => uniqueSorted(ids.filter((id) => members.has(id)));
  if (
    (input.kind === 'changeset_approval' || input.kind === 'decision') &&
    (input.affectedUserIds?.length ?? 0) > 0
  ) {
    return onlyMembers(input.affectedUserIds ?? []);
  }
  if (input.kind === 'destination' || input.tripId === null)
    return uniqueSorted(input.activeMemberIds);
  return onlyMembers(input.seatHolderIds ?? input.activeMemberIds);
}

/** A new crew member joins the vote only while a destination board is open. */
export function joinsOpenPoll(kind: PollKind, stage: PollStage | null): boolean {
  return kind === 'destination' && stage === 'board';
}

export function withVoterAdded(eligible: readonly string[], uid: string): string[] {
  return uniqueSorted([...eligible, uid]);
}

export function withVoterRemoved(eligible: readonly string[], uid: string): string[] {
  return eligible.filter((id) => id !== uid);
}
