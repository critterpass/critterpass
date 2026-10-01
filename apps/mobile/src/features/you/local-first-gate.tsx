/**
 * Holds a profile screen until the local database is open: a cold start can restore the profile
 * before the session's local-first stack is up.
 */
import { useContext, type ReactNode } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Scaffold } from '@/ui/surface/Scaffold';

function Waiting() {
  // A moment's placeholder, gone before anyone could look for a way back.
  useNoBackByDesign();
  return <Scaffold variant="dark" testID="you-waiting" />;
}

export function LocalFirstGate({ children }: { readonly children: ReactNode }) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return <Waiting />;
  return children;
}
