/**
 * Holds a critter screen until the local database is open: a cold start can restore the PASS tab
 * or a critter route before the session's local-first stack is up.
 */
import { useContext, type ReactNode } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { SessionWaiting } from '@/ui/states/SessionWaiting';

export function LocalFirstGate({ children }: { readonly children: ReactNode }) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return <SessionWaiting testID="critters-waiting" />;
  return children;
}
