/**
 * The swipe card's facts: the trip's open swipe session (if any), its deck size, and how many of the
 * crew other than me are on its presence channel right now.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { DECK_SIZE } from '@cp/domain';

import { usePresence } from '@/data/realtime/use-presence';

import { useLiveRows } from '../data/live-rows';
import { useMyUid } from '../queries';
import { swipeLive, type SwipeLive } from './trip-explore-model';

const OPEN_SQL = `SELECT id, json_array_length(coalesce(deck, '[]')) AS cards FROM swipe_sessions
  WHERE trip_id = ? AND status <> 'ended' ORDER BY created_at DESC LIMIT 1`;

export function useSwipeEntry(tripId: string): {
  readonly deckSize: number;
  readonly live: SwipeLive;
} {
  const me = useMyUid();
  const open = useLiveRows<{ id: string; cards: number | null }>(
    OPEN_SQL,
    [tripId],
    ['swipe_sessions'],
  ).rows[0];
  const present = usePresence('swipe', open?.id ?? null);
  const others = present.filter((member) => member.uid !== me).length;
  const cards = open?.cards ?? 0;
  return {
    deckSize: cards > 0 ? cards : DECK_SIZE,
    live: swipeLive(open !== undefined, others),
  };
}
