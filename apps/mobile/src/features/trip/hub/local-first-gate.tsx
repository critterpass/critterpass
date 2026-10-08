/**
 * Holds a trip day screen until the local database is open. A cold start can restore a trip
 * route before the session's local-first stack is up; the screen then shows the loading state
 * for that moment instead of reading from a database that is not there yet.
 * The session-only layouts hold their screens the same way (`ui/states/SessionGate`); this wrapper
 * keeps the wait for a screen rendered outside one.
 */
import { useContext, type ReactNode } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { DatabaseWait } from '@/ui/states/SessionGate';

export function LocalFirstGate({ children }: { readonly children: ReactNode }) {
  return (
    <DatabaseWait open={useContext(LocalFirstContext) !== null} testID="trip-waiting">
      {children}
    </DatabaseWait>
  );
}

function Hold({ tripId }: { readonly tripId: string }) {
  useTripStreams(tripId);
  return null;
}

/** Holds the trip's sync streams once the local database is open (a layout can mount before). */
export function TripStreams({ tripId }: { readonly tripId: string | null }) {
  const localFirst = useContext(LocalFirstContext);
  return localFirst === null || tripId === null ? null : <Hold tripId={tripId} />;
}
