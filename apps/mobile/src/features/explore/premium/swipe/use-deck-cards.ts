/**
 * The cards the swipe deck is handed, in the order they first showed: the deck keeps its own
 * place in the list, so cards already voted stay at the front and new ones join the end. That way
 * the card that grew behind the one just voted becomes the top card itself, never a fresh mount.
 */
import { useState } from 'react';

import type { SwipeCardFace } from '../../swipe-view-props';

/** `seen` with the ids of `ahead` it lacks added at the end; `seen` itself when none are new. */
export function mergeDeckIds(seen: readonly string[], ahead: readonly string[]): readonly string[] {
  const known = new Set(seen);
  const added = ahead.filter((id) => !known.has(id));
  return added.length === 0 ? seen : [...seen, ...added];
}

export function useDeckCards(ahead: readonly SwipeCardFace[]): readonly SwipeCardFace[] {
  const [seen, setSeen] = useState<readonly SwipeCardFace[]>(ahead);
  const ids = seen.map((face) => face.poiId);
  const merged = mergeDeckIds(
    ids,
    ahead.map((face) => face.poiId),
  );
  if (merged !== ids) {
    const known = new Set(ids);
    setSeen([...seen, ...ahead.filter((face) => !known.has(face.poiId))]);
  }
  // The newest words for every card still ahead (a photo that arrived, a new "who said yes").
  const fresh = new Map(ahead.map((face) => [face.poiId, face]));
  return seen.map((face) => fresh.get(face.poiId) ?? face);
}
