/**
 * What a swipe match turned into, read from its synced row: a place in the trip's Ideas (the
 * server's answer while the planning screens are on: the match carries no change set, and the idea
 * holds everyone who said yes), or, for matches made before, a change set suggesting it for a day.
 */
export type MatchOutcome =
  | { readonly kind: 'idea' }
  | { readonly kind: 'suggested'; readonly dayNo: number }
  | { readonly kind: 'match' };

export interface MatchFacts {
  readonly changeSetId: string | null;
  readonly dayNo: number | null;
  /** The trip idea for the matched place, once it has synced. */
  readonly ideaId: string | null;
}

export function matchOutcome(match: MatchFacts, redesign: boolean): MatchOutcome {
  if (match.changeSetId !== null) {
    return match.dayNo === null ? { kind: 'match' } : { kind: 'suggested', dayNo: match.dayNo };
  }
  if (match.ideaId !== null) return { kind: 'idea' };
  // A new match lands in Ideas on the server; its idea row may sync a moment after the match.
  if (redesign && match.dayNo === null) return { kind: 'idea' };
  return match.dayNo === null ? { kind: 'match' } : { kind: 'suggested', dayNo: match.dayNo };
}
