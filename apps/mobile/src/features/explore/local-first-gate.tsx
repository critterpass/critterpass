/**
 * Holds an Explore screen until the local database is open: a cold start or a link can open
 * an Explore route before the session's local-first stack is up.
 */
import { useContext, type ReactNode } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Scaffold } from '@/ui/surface/Scaffold';

function Waiting() {
  // A moment's placeholder, gone before anyone could look for a way back.
  useNoBackByDesign();
  return <Scaffold variant="dark" testID="explore-waiting" />;
}

export function LocalFirstGate({ children }: { readonly children: ReactNode }) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return <Waiting />;
  return children;
}
