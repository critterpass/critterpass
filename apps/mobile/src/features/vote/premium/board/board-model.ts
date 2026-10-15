/**
 * What the destination board offers, from the poll alone: an empty board asks for the first
 * pitch; a board with places takes votes, and its organiser moves it on (one place is locked in,
 * two or more go to the final); a final is drawn as the two-place card that opens the showdown.
 * A tie for a final spot comes back from `advance_poll_stage` as `needs_pick`, and the organiser
 * picks the places that fill the open spots.
 */
/* eslint-disable lingui/no-unlocalized-strings -- shape and action names, never copy. */
import type { PollView } from '../../data/poll-view';

export type BoardShape = 'empty' | 'board' | 'final';

/** The organiser's move on a board: lock in its one place, or start the final. */
export type BoardAction = 'lock_in' | 'go_to_final' | null;

export function boardShape(poll: Pick<PollView, 'stage' | 'options'>): BoardShape {
  if (poll.stage === 'final') return 'final';
  return poll.options.length === 0 ? 'empty' : 'board';
}

export function boardAction(
  poll: Pick<PollView, 'stage' | 'status' | 'options'>,
  organiser: boolean,
): BoardAction {
  if (!organiser || poll.status !== 'open' || boardShape(poll) !== 'board') return null;
  return poll.options.length === 1 ? 'lock_in' : 'go_to_final';
}

/** The places level for the final's open spots, and how many of them the organiser picks. */
export interface FinalPick {
  readonly tied: readonly string[];
  readonly settled: readonly string[];
  readonly spots: number;
}

/** The `needs_pick` refusal's detail as a pick, or null for any other answer. */
export function finalPickOf(detail: unknown): FinalPick | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const record = detail as Record<string, unknown>;
  if (record['reason'] !== 'needs_pick') return null;
  const ids = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  const tied = ids(record['tied_option_ids']);
  const settled = ids(record['settled_option_ids']);
  const spots = Math.max(0, Math.min(tied.length, 2 - settled.length));
  return tied.length === 0 || spots === 0 ? null : { tied, settled, spots };
}

/**
 * The picked places after a tap on `optionId`: a tied place toggles; a pick past the open spots
 * drops the oldest one, so a single spot behaves like a choice.
 */
export function togglePick(
  pick: FinalPick,
  picked: readonly string[],
  optionId: string,
): readonly string[] {
  if (!pick.tied.includes(optionId)) return picked;
  if (picked.includes(optionId)) return picked.filter((id) => id !== optionId);
  const next = [...picked, optionId];
  return next.length > pick.spots ? next.slice(next.length - pick.spots) : next;
}

/** Whether the viewer may take a place off the board: its organiser, or whoever pitched it. */
export function canRemove(organiser: boolean, proposedBy: string | null, me: string): boolean {
  return organiser || proposedBy === me;
}
