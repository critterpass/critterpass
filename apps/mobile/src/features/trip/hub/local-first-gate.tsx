/**
 * Holds a trip day screen until the local database is open. A cold start can restore a trip
 * route before the session's local-first stack is up; the screen then shows a plain dark page for
 * that moment instead of reading from a database that is not there yet.
 */
import { useContext, type ReactNode } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Scaffold } from '@/ui/surface/Scaffold';

function Waiting() {
  // A moment's placeholder, gone before anyone could look for a way back.
  useNoBackByDesign();
  return <Scaffold variant="dark" testID="trip-waiting" />;
}

export function LocalFirstGate({ children }: { readonly children: ReactNode }) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return <Waiting />;
  return children;
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
