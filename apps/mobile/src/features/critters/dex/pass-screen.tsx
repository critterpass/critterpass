/**
 * The PASS tab over synced rows: the Critterdex, the trip egg (HATCH IT queues `hatch_egg` and
 * plays the ceremony at once, offline too), and Explore at home (the device's own opt-in plus
 * `set_explore_at_home`, so the server accepts home-set encounters).
 */
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { setExploreAtHome, useExploreAtHome } from '@/lib/location';

import { hatchEggCommand, setExploreAtHomeCommand } from '../data/commands';
import { eggCardFor, hatchSeen, useHatchSeenVersion } from '../hatch/hatch-model';
import { useEncounter } from '../engine/use-encounter';
import { critterRoute, encounterRoute, hatchRoute, LEGENDARIES_ROUTE, setRoute } from '../routes';
import type { DexFilter } from './dex-model';
import { DexView } from './dex-view';
import { useDexRows } from './use-dex';

const LIVE = new Set(['accruing', 'ready', 'draining']);

export function PassScreen({ now = () => new Date() }: { readonly now?: () => Date }) {
  const data = useDexRows();
  const [filter, setFilter] = useState<DexFilter>('all');
  const [query, setQuery] = useState('');
  const hatch = useCommand(hatchEggCommand);
  const explore = useCommand(setExploreAtHomeCommand);
  const exploreOn = useExploreAtHome();
  useHatchSeenVersion();
  const egg = eggCardFor(data.input.trips, now(), hatchSeen);
  const { snapshot } = useEncounter();
  const live = LIVE.has(snapshot.phase) && snapshot.encounterId !== null;
  const encounterId = snapshot.encounterId;

  const onHatch = () => {
    if (egg === null) return;
    void hatch.send({ trip_id: egg.tripId, trigger: 'manual' });
    router.push(hatchRoute(egg.tripId));
  };

  return (
    <DexView
      state={data.loaded ? 'ready' : 'loading'}
      model={data.model}
      near={data.near}
      filter={filter}
      onFilter={setFilter}
      query={query}
      onQuery={setQuery}
      egg={egg}
      hatching={hatch.pending}
      onHatch={onHatch}
      onOpenHatch={() => egg !== null && router.push(hatchRoute(egg.tripId))}
      exploreAtHome={data.model.home === null ? null : exploreOn}
      onExploreAtHome={(on) => {
        setExploreAtHome(on);
        void explore.send({ on });
      }}
      onOpenSet={(id) => router.push(setRoute(id))}
      onOpenCritter={(id) => router.push(critterRoute(id))}
      onOpenLegendaries={() => router.push(LEGENDARIES_ROUTE)}
      encounter={
        live && encounterId !== null
          ? {
              place: snapshot.candidate?.spot.name ?? '',
              progress: snapshot.progress,
              onOpen: () => router.push(encounterRoute(encounterId)),
            }
          : null
      }
    />
  );
}
