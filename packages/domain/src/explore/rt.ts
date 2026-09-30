/**
 * `swipe:{session_id}` realtime event types (docs/api-contracts-async.md §1): who voted (never the
 * verdict), matches, progress and the deck becoming ready. `trip_plan:` carries `match.inserted`
 * when a match becomes a plan suggestion.
 */
export const SWIPE_RT = {
  vote: 'vote',
  match: 'match',
  progress: 'progress',
  deckReady: 'deck_ready',
  ended: 'ended',
} as const;

export const MATCH_INSERTED_RT = 'match.inserted';
