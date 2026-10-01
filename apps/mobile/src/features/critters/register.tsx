/**
 * The critters area's startup hook, imported once by the root layout: joins its screens to the
 * navigation registry and hands the session its runtime: the hatch watcher and the encounter
 * engine (fed by the location engine only while there is something to meet). The root route
 * passes the App Group writer for the nearby snapshot the Live Activity and widgets read.
 */
import { useContext, useEffect } from 'react';

import { LocalFirstContext } from '@/data/powersync/local-first-context';

import { setNearbyWriter, type SnapshotWriter } from './engine/nearby-snapshot';
import { EncounterRuntime } from './engine/use-encounter';
import { HatchRuntime } from './hatch/hatch-runtime';
import { registerCritterScreens } from './routes';
// Crew quests join the trip hub (the QUESTS tile) and the navigation registry as this loads.
import './quests/register';

registerCritterScreens();

export function CritterRuntime({ writeSnapshot }: { readonly writeSnapshot?: SnapshotWriter }) {
  const localFirst = useContext(LocalFirstContext);
  useEffect(() => {
    setNearbyWriter(writeSnapshot ?? null);
    return () => setNearbyWriter(null);
  }, [writeSnapshot]);
  if (localFirst === null) return null;
  return (
    <>
      <HatchRuntime />
      <EncounterRuntime />
    </>
  );
}
