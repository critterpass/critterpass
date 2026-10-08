/**
 * The PASS tab over synced rows: the Critterdex, the trip egg (HATCH IT queues `hatch_egg` and
 * plays the ceremony at once, offline too), and Explore at home (the device's own opt-in plus
 * `set_explore_at_home`, so the server accepts home-set encounters).
 *
 * The dex stays mounted while another screen or tab is in front, so it is where the person left
 * it when they come back; its cells are plain images and its loops rest when the tab is hidden.
 */
import { guideOfForm } from '@cp/domain';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { setExploreAtHome, useExploreAtHome } from '@/lib/location';
import { useScreenHref } from '@/lib/navigation/screen-registry';

import { hatchEggCommand, setExploreAtHomeCommand } from '../data/commands';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { eggCardFor, hatchSeen, useHatchSeenVersion } from '../hatch/hatch-model';
import { critterRoute, hatchRoute, LEGENDARIES_ROUTE, setRoute, whereRoute } from '../routes';
import { NearMap } from '../where/near-map';
import type { DexFilter } from './dex-model';
import { DexView } from './dex-view';
import { LiveEncounterBanner } from './encounter-banner';
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
import { StickerShelf } from '../stickers';

/* eslint-disable lingui/no-unlocalized-strings -- SQL and a design screen id, never copy. */
const PROFILE_SCREEN = '3n-1';
const FROM_PASS = '?from=pass';
const ME_SQL = `SELECT u.display_name, a.kind AS avatar_kind, a.form_id AS avatar_form_id
  FROM users u LEFT JOIN avatars a ON a.id = u.avatar_id WHERE u.id = ?`;
const ME_TABLES = ['users', 'avatars'];
/* eslint-enable lingui/no-unlocalized-strings */

interface MeRow {
  readonly display_name: string | null;
  readonly avatar_kind: string | null;
  readonly avatar_form_id: string | null;
}

export function PassScreen({ now = () => new Date() }: { readonly now?: () => Date }) {
  const data = useDexRows();
  const uid = useOwnerUid();
  const me = useLiveRows<MeRow>(ME_SQL, uid === null ? null : [uid], ME_TABLES).rows[0];
  // The way to the profile (and from there Settings) for someone with no crew yet: Home shows its
  // "HEY {NAME}" header only once there is one.
  const profileHref = useScreenHref(PROFILE_SCREEN);
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
    <DexView
      shelf={<StickerShelf />}
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
      onOpenLegendaries={() => router.push(LEGENDARIES_ROUTE)}
      profile={
        profileHref === undefined || me === undefined
          ? undefined
          : {
              name: me.display_name?.trim() ?? '',
              uid,
              guide:
                me.avatar_kind === 'critter' && me.avatar_form_id !== null
                  ? guideOfForm(me.avatar_form_id)
                  : null,
              // The profile's back control then reads "Pass", where the person came from.
              onOpen: () =>
                router.push(
                  typeof profileHref === 'string' ? `${profileHref}${FROM_PASS}` : profileHref,
                ),
            }
      }
      slippedAway={slippedAway}
      onDismissSlipped={() => slippedAway !== null && dismissSlipped(slippedAway.encounterId)}
      encounterBanner={<LiveEncounterBanner />}
      landed={typeof landed === 'string' && landed !== '' ? landed : null}
      onLandedShown={() => router.setParams({ landed: undefined })}
    />
  );
}
