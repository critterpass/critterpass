/**
 * The idea board's rules on the phone (3p-4): which ideas each tab lists, the count a row shows
 * with the traveller's own vote applied before it syncs, and the votes left this month. Votes cast
 * or taken back on this screen count at once; the synced `idea_votes` rows catch up later.
 */
import { IDEA_VOTE_BUDGET } from '@cp/domain';

export type BoardTab = 'top' | 'new' | 'shipped';

export type BoardStatus =
  'pending_review' | 'open' | 'planned' | 'building' | 'shipped' | 'declined' | 'merged';

export interface BoardIdea {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: BoardStatus;
  readonly team_note: string | null;
  readonly votes_count: number;
  readonly status_changed_at: string;
  readonly created_at: string;
}

export interface MyVote {
  readonly idea_id: string;
  readonly month_key: string;
}

/** Votes cast (true) or taken back (false) on this screen, not yet in the synced rows. */
export type VoteOverrides = ReadonlyMap<string, boolean>;

const VOTABLE: ReadonlySet<BoardStatus> = new Set(['open', 'planned', 'building']);

export function isVotable(status: BoardStatus): boolean {
  return VOTABLE.has(status);
}

/**
 * The rows of a tab. TOP: ideas taking votes, most voted first. NEW: ideas taking votes and the
 * traveller's own ideas under review, newest first. SHIPPED: shipped ideas, latest first. Declined
 * and merged ideas are never listed.
 */
export function boardRows(
  ideas: readonly BoardIdea[],
  mine: readonly BoardIdea[],
  tab: BoardTab,
): readonly BoardIdea[] {
  const byNewest = (a: BoardIdea, b: BoardIdea) =>
    b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
  switch (tab) {
    case 'top':
      return ideas
        .filter((idea) => isVotable(idea.status))
        .sort(
          (a, b) =>
            b.votes_count - a.votes_count ||
            b.created_at.localeCompare(a.created_at) ||
            a.id.localeCompare(b.id),
        );
    case 'new': {
      const seen = new Set(ideas.map((idea) => idea.id));
      const pending = mine.filter((idea) => idea.status === 'pending_review' && !seen.has(idea.id));
      return [...pending, ...ideas.filter((idea) => isVotable(idea.status))].sort(byNewest);
    }
    case 'shipped':
      return ideas
        .filter((idea) => idea.status === 'shipped')
        .sort(
          (a, b) =>
            b.status_changed_at.localeCompare(a.status_changed_at) || a.id.localeCompare(b.id),
        );
  }
}

/** Whether the traveller's vote is on an idea, this screen's taps over the synced rows. */
export function hasMyVote(
  ideaId: string,
  synced: ReadonlySet<string>,
  overrides: VoteOverrides,
): boolean {
  return overrides.get(ideaId) ?? synced.has(ideaId);
}

/** The count a row shows: the server's, moved by a vote this screen added or took back. */
export function shownCount(
  idea: BoardIdea,
  synced: ReadonlySet<string>,
  overrides: VoteOverrides,
): number {
  const mine = hasMyVote(idea.id, synced, overrides);
  const counted = synced.has(idea.id);
  return Math.max(0, idea.votes_count + (mine ? 1 : 0) - (counted ? 1 : 0));
}

/** Votes left in `month`: the budget less the votes in it that still stand. */
export function votesLeft(
  myVotes: readonly MyVote[],
  overrides: VoteOverrides,
  month: string,
): number {
  const standing = new Set(myVotes.filter((v) => v.month_key === month).map((v) => v.idea_id));
  const all = new Set(myVotes.map((v) => v.idea_id));
  for (const [ideaId, voted] of overrides) {
    if (voted && !all.has(ideaId)) standing.add(ideaId);
    if (!voted) standing.delete(ideaId);
  }
  return Math.max(0, IDEA_VOTE_BUDGET - standing.size);
}
