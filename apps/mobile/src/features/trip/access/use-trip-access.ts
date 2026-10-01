/** Live access to one trip id from the local database and the trip's own sync stream. */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and stream names, never copy. */
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { TRIP_STREAM_TTL_S } from '@/data/powersync/use-trip-streams';
import { useSyncStatus } from '@/data/status/use-sync-status';

import { watchQuery } from '../hub/data/live-rows';
import { tripAccess, type TripAccess } from './trip-access';

interface Seen {
  readonly tripId: string | null;
  readonly hasRow: boolean | null;
  readonly streamSynced: boolean;
}

/** Live access to one trip id; `null` (no trip id in the route) is always `checking`. */
export function useTripAccess(tripId: string | null): TripAccess {
  const { db } = useLocalFirst();
  const online = useSyncStatus().phase === 'online';
  const [seen, setSeen] = useState<Seen>({ tripId, hasRow: null, streamSynced: false });

  useEffect(() => {
    if (tripId === null) return undefined;
    const abort = new AbortController();
    const update = (change: Partial<Seen>) =>
      setSeen((prev) =>
        prev.tripId === tripId
          ? { ...prev, ...change }
          : { tripId, hasRow: null, streamSynced: false, ...change },
      );
    const stopWatching = watchQuery<{ found: number }>(
      db,
      'SELECT 1 AS found FROM trips WHERE id = ? LIMIT 1',
      [tripId],
      ['trips'],
      (rows) => update({ hasRow: rows.length > 0 }),
    );
    let held: { unsubscribe(): void } | null = null;
    db.syncStream('trip', { trip_id: tripId })
      .subscribe({ ttl: TRIP_STREAM_TTL_S })
      .then((subscription) => {
        if (abort.signal.aborted) {
          subscription.unsubscribe();
          return undefined;
        }
        held = subscription;
        return subscription
          .waitForFirstSync(abort.signal)
          .then(() => update({ streamSynced: true }));
      })
      .catch(() => undefined);
    return () => {
      abort.abort();
      stopWatching();
      held?.unsubscribe();
    };
  }, [db, tripId]);

  if (seen.tripId !== tripId) return 'checking';
  return tripAccess(seen.hasRow, seen.streamSynced && online);
}
