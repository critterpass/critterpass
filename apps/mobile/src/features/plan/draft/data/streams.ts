/**
 * Keeps the organiser's private drafting rows syncing while a drafting screen is open: the
 * `trip_draft` stream (draft versions, their days and items, the trip's jobs and redraft
 * reservations; the server only serves it to organisers), plus the shared trip streams (the
 * crew-wide redraft counter rides `trip`). The subscription outlives the screen by an hour so going
 * back and forth does not refetch.
 */
/* eslint-disable lingui/no-unlocalized-strings -- stream names, never copy. */
import { useEffect } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useTripStreams } from '@/data/powersync/use-trip-streams';

const TTL_S = 60 * 60;
const DRAFT_STREAM = 'trip_draft';

export function useDraftStreams(tripId: string | null): void {
  useTripStreams(tripId);
  const { db } = useLocalFirst();
  useEffect(() => {
    if (tripId === null) return undefined;
    let closed = false;
    const held: { unsubscribe(): void }[] = [];
    void db
      .syncStream(DRAFT_STREAM, { trip_id: tripId })
      .subscribe({ ttl: TTL_S })
      .then(
        (subscription) => {
          if (closed) subscription.unsubscribe();
          else held.push(subscription);
        },
        () => undefined,
      );
    return () => {
      closed = true;
      for (const subscription of held.splice(0)) subscription.unsubscribe();
    };
  }, [db, tripId]);
}
