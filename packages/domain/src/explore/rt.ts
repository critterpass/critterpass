/**
 * `swipe:{session_id}` realtime event types (docs/api-contracts-async.md §1): who voted (never the
 * verdict), matches, progress and the deck becoming ready.
 */
export const SWIPE_RT = {
  vote: 'vote',
  match: 'match',
  progress: 'progress',
  deckReady: 'deck_ready',
  ended: 'ended',
} as const;
