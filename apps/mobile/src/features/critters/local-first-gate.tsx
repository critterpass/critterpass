/**
 * Holds a critter screen until the local database is open: a cold start can restore the PASS tab
 * or a critter route before the session's local-first stack is up.
 * The session-only layouts hold their screens the same way (`ui/states/SessionGate`); this wrapper
 * keeps the wait for a screen rendered outside one.
 */
import { useContext, type ReactNode } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { DatabaseWait } from '@/ui/states/SessionGate';

export function LocalFirstGate({ children }: { readonly children: ReactNode }) {
  return (
    <DatabaseWait open={useContext(LocalFirstContext) !== null} testID="critters-waiting">
      {children}
    </DatabaseWait>
  );
}
