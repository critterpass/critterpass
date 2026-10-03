/**
 * The trip an expense message belongs to, and whether that trip's `trip` stream (its expenses,
 * shares and edit history) has synced at least once on this device. The chat rides the crew's
 * streams, so an expense card holds the trip stream itself while it is on screen; once the stream
 * has synced, an expense that is still missing is one the crew removed (deleted expenses leave the
 * stream), not one still on its way.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and stream names, never copy. */
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { TRIP_STREAM_TTL_S } from '@/data/powersync/use-trip-streams';

import { useLiveRows } from '../data/live-rows';

const MESSAGE_TRIP_SQL = 'SELECT trip_id FROM messages WHERE id = ?';

export interface ExpenseTrip {
  readonly tripId: string | null;
  /** The message's trip is known (or known to have none). */
  readonly known: boolean;
  /** The trip stream has synced at least once. */
  readonly synced: boolean;
}

export function useExpenseTrip(messageId: string): ExpenseTrip {
  const { db } = useLocalFirst();
  const message = useLiveRows<{ trip_id: string | null }>(
    MESSAGE_TRIP_SQL,
    [messageId],
    ['messages'],
  );
  const tripId = message.rows[0]?.trip_id ?? null;
  const [synced, setSynced] = useState<string | null>(null);
  useEffect(() => {
    if (tripId === null) return undefined;
    const abort = new AbortController();
    let held: { unsubscribe(): void } | null = null;
    db.syncStream('trip', { trip_id: tripId })
      .subscribe({ ttl: TRIP_STREAM_TTL_S })
      .then((subscription) => {
        if (abort.signal.aborted) {
          subscription.unsubscribe();
          return undefined;
        }
        held = subscription;
        return subscription.waitForFirstSync(abort.signal).then(() => {
          if (!abort.signal.aborted) setSynced(tripId);
        });
      })
      .catch(() => undefined);
    return () => {
      abort.abort();
      held?.unsubscribe();
    };
  }, [db, tripId]);
  return { tripId, known: message.loaded, synced: tripId !== null && synced === tripId };
}
