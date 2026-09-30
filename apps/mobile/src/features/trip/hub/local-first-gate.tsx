/**
 * Holds a trip day screen until the local database is open. A cold start can restore a trip
 * route before the session's local-first stack is up; the screen then shows a plain dark page for
 * that moment instead of reading from a database that is not there yet.
 */
import { useContext, type ReactNode } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { Scaffold } from '@/ui/surface/Scaffold';

export function LocalFirstGate({ children }: { readonly children: ReactNode }) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return <Scaffold variant="dark" testID="trip-waiting" />;
  return children;
}
