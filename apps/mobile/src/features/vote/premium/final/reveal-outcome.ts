/**
 * What the winner stamp says to this viewer: the winner and the runner-up, whether the place was
 * locked in without a vote (no score, nothing missed), and whether the viewer missed the vote or
 * backed the place that lost. Organisers get "Set up …"; everyone else needs their own way out.
 */
import type { PollOptionView, PollView } from '../../data/poll-view';

export interface RevealOutcome {
  readonly winner: PollOptionView;
  readonly loser: PollOptionView | null;
  /** Nobody voted: the organiser locked the place in. */
  readonly lockedIn: boolean;
  /** The viewer could vote and didn't. */
  readonly missed: boolean;
  /** The viewer's pick lost. */
  readonly lost: boolean;
  /** Vote share per option id (0–1), for the tally bars. */
  readonly share: ReadonlyMap<string, number>;
}

export function revealOutcome(poll: PollView, me: string): RevealOutcome | null {
  const winner = poll.options.find((option) => option.winner);
  if (winner === undefined) return null;
  const others = poll.options.filter((option) => option.id !== winner.id);
  const loser = others.reduce<PollOptionView | null>(
    (best, option) => (best === null || option.votes > best.votes ? option : best),
    null,
  );
  const lockedIn = poll.votedCount === 0;
  const total = poll.options.reduce((sum, option) => sum + option.votes, 0);
  return {
    winner,
    loser,
    lockedIn,
    missed: !lockedIn && poll.eligibleIds.includes(me) && poll.myOptionId === null,
    lost: poll.myOptionId !== null && poll.myOptionId !== winner.id,
    share: new Map(
      poll.options.map((option) => [option.id, total === 0 ? 0 : option.votes / total]),
    ),
  };
}
