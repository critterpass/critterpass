/**
 * Whether the trip's place pack (the `trip_pack` stream) has finished its first sync on this phone:
 * until then a search sees only the places that have landed so far. No trip: nothing to wait on.
 * A stream that cannot be held reads as synced, so a search never waits on it forever.
 */
/* eslint-disable lingui/no-unlocalized-strings -- stream names, never copy. */
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { TRIP_STREAM_TTL_S } from '@/data/powersync/use-trip-streams';

const TRIP_PACK_STREAM = 'trip_pack';

export function useTripPackSynced(tripId: string | null): boolean {
  const { db } = useLocalFirst();
  const [synced, setSynced] = useState<string | null>(null);
  useEffect(() => {
    if (tripId === null) return undefined;
    const abort = new AbortController();
    let held: { unsubscribe(): void } | null = null;
    const done = () => {
      if (!abort.signal.aborted) setSynced(tripId);
    };
    db.syncStream(TRIP_PACK_STREAM, { trip_id: tripId })
      .subscribe({ ttl: TRIP_STREAM_TTL_S })
      .then((subscription) => {
        if (abort.signal.aborted) {
          subscription.unsubscribe();
          return undefined;
        }
        held = subscription;
        return subscription.waitForFirstSync(abort.signal);
      })
      .then(done, done);
    return () => {
      abort.abort();
      held?.unsubscribe();
    };
  }, [db, tripId]);
  return tripId === null || synced === tripId;
}
