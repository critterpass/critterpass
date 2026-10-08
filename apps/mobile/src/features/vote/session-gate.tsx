/**
 * Vote and place screens read the local database, which exists only once the signed-in session
 * has started. A cold start can restore one of these screens before that happens, so each route
 * waits here (the loading state, for the moment the session takes) instead of failing.
 * The session-only layouts hold their screens the same way (`ui/states/SessionGate`); this wrapper
 * keeps the wait for a screen rendered outside one.
 */
import { useContext, type ReactNode } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { DatabaseWait } from '@/ui/states/SessionGate';

export function VoteSessionGate({ children }: { readonly children: ReactNode }) {
  return (
    <DatabaseWait open={useContext(LocalFirstContext) !== null} testID="vote-waiting">
      {children}
    </DatabaseWait>
  );
}
