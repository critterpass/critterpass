/**
 * Holds the `explore` sync stream for a destination while mounted: its curated places and the
 * approved guide tips. The subscription outlives the screen by a day, so a destination someone
 * browsed keeps its places for the place page, the map and offline search.
 */
/* eslint-disable lingui/no-unlocalized-strings -- stream names, never copy. */
import { useEffect } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

const EXPLORE_STREAM = 'explore';
const EXPLORE_STREAM_TTL_S = 60 * 60 * 24;

export function useExploreStream(destinationId: string | null): void {
  const { db } = useLocalFirst();
  useEffect(() => {
    if (destinationId === null) return undefined;
    let released = false;
    let held: { unsubscribe(): void } | null = null;
    db.syncStream(EXPLORE_STREAM, { destination_id: destinationId })
      .subscribe({ ttl: EXPLORE_STREAM_TTL_S })
      .then(
        (subscription) => {
          if (released) subscription.unsubscribe();
          else held = subscription;
        },
        () => undefined,
      );
    return () => {
      released = true;
      held?.unsubscribe();
    };
  }, [db, destinationId]);
}
