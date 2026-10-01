/**
 * Vote and place screens read the local database, which exists only once the signed-in session
 * has started. A cold start can restore one of these screens before that happens, so each route
 * waits here (the loading state, for the moment the session takes) instead of failing.
 */
import { useContext, type ReactNode } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { SessionWaiting } from '@/ui/states/SessionWaiting';

export function VoteSessionGate({ children }: { readonly children: ReactNode }) {
  const localFirst = useContext(LocalFirstContext);
  return localFirst === null ? <SessionWaiting testID="vote-waiting" /> : children;
}
