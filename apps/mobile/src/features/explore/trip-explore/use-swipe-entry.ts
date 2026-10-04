/**
 * The swipe card's facts: whether the trip has an open swipe session, and its deck size. Explore
 * never joins the session's presence channel (reading it would show the viewer as swiping to the
 * crew), so who is live shows only on the swipe screen itself.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { DECK_SIZE } from '@cp/domain';

import { useLiveRows } from '../data/live-rows';
import { swipeLive, type SwipeLive } from './trip-explore-model';

const OPEN_SQL = `SELECT id, json_array_length(coalesce(deck, '[]')) AS cards FROM swipe_sessions
  WHERE trip_id = ? AND status <> 'ended' ORDER BY created_at DESC LIMIT 1`;

export function useSwipeEntry(tripId: string): {
  readonly deckSize: number;
  readonly live: SwipeLive;
} {
  const open = useLiveRows<{ id: string; cards: number | null }>(
    OPEN_SQL,
    [tripId],
    ['swipe_sessions'],
  ).rows[0];
  const cards = open?.cards ?? 0;
  return { deckSize: cards > 0 ? cards : DECK_SIZE, live: swipeLive(open !== undefined) };
}
