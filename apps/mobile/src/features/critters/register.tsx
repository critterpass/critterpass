/**
 * The critters area's startup hook, imported once by the root layout: joins its screens to the
 * navigation registry and hands the session its runtime (the hatch watcher and, while an
 * encounter is on, the engine's location subscription), mounted inside the signed-in session.
 */
import { useContext } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';

import { HatchRuntime } from './hatch/hatch-runtime';
import { registerCritterScreens } from './routes';

registerCritterScreens();

export function CritterRuntime() {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return null;
  return <HatchRuntime />;
}
