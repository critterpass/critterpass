/**
 * The PASS tab over synced rows: the Critterdex, the trip egg (HATCH IT queues `hatch_egg` and
 * plays the ceremony at once, offline too), and Explore at home (the device's own opt-in plus
 * `set_explore_at_home`, so the server accepts home-set encounters).
 *
 * The dex stays mounted while another screen or tab is in front, so it is where the person left
 * it when they come back; its cells are plain images and its loops rest when the tab is hidden.
 */
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useState, type ComponentType } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { setExploreAtHome, useExploreAtHome } from '@/lib/location';

import { hatchEggCommand, setExploreAtHomeCommand } from '../data/commands';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { eggCardFor, hatchSeen, useHatchSeenVersion } from '../hatch/hatch-model';
import { critterRoute, hatchRoute, LEGENDARIES_ROUTE, setRoute, whereRoute } from '../routes';
import { StickerShelf } from '../stickers/sticker-shelf';
import { NearMap } from '../where/near-map';
import type { DexFilter } from './dex-model';
import type { DexViewProps } from './dex-view-props';
import {
  dismissSlipped,
  SLIPPED_SQL,
  SLIPPED_TABLES,
  slippedAwayFor,
  slippedDismissed,
  useSlippedVersion,
  type SlippedRow,
} from './slipped-away';
import { useDexRows } from './use-dex';

export function PassScreen({
  now = () => new Date(),
  View,
}: {
  readonly now?: () => Date;
  /** The view that draws the dex. */
  readonly View: ComponentType<DexViewProps>;
}) {
  const data = useDexRows();
  const uid = useOwnerUid();
  const [filter, setFilter] = useState<DexFilter>('all');
  const [query, setQuery] = useState('');
  const hatch = useCommand(hatchEggCommand);
  const explore = useCommand(setExploreAtHomeCommand);
  const exploreOn = useExploreAtHome();
  useHatchSeenVersion();
  const egg = eggCardFor(data.input.trips, now(), hatchSeen);
  useSlippedVersion();
  const slipped = useLiveRows<SlippedRow>(SLIPPED_SQL, uid === null ? null : [uid], SLIPPED_TABLES);
  const slippedAway = slippedAwayFor(slipped.rows, now(), slippedDismissed);
  const { landed } = useLocalSearchParams<{ landed?: string }>();
  // The map is a live native surface that watches the position: it rests while the tab is hidden.
  const focused = useIsFocused();

  const onHatch = () => {
    if (egg === null) return;
    void hatch.send({ trip_id: egg.tripId, trigger: egg.trigger ?? 'manual' });
    router.push(hatchRoute(egg.tripId));
  };

  return (
    <View
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
      onOpenWhere={(formId) => router.push(whereRoute(formId))}
      nearMap={focused ? <NearMap watching={filter === 'near'} /> : null}
      shelf={<StickerShelf />}
      onOpenLegendaries={() => router.push(LEGENDARIES_ROUTE)}
      slippedAway={slippedAway}
      onDismissSlipped={() => slippedAway !== null && dismissSlipped(slippedAway.encounterId)}
      landed={typeof landed === 'string' && landed !== '' ? landed : null}
      onLandedShown={() => router.setParams({ landed: undefined })}
    />
  );
}
