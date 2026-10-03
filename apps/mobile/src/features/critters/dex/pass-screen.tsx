/**
 * The PASS tab over synced rows: the Critterdex, the trip egg (HATCH IT queues `hatch_egg` and
 * plays the ceremony at once, offline too), and Explore at home (the device's own opt-in plus
 * `set_explore_at_home`, so the server accepts home-set encounters).
 *
 * While another screen or tab is in front, the dex is not drawn: its grid is dozens of live Skia
 * canvases (each one a GL surface on Android), and keeping them up under the encounter left the
 * screen on top without surfaces of its own (no scene, no critter) and stalled the app. The rows
 * stay loaded, so coming back draws the dex at once.
 */
import { guideOfForm } from '@cp/domain';
import { router, useIsFocused } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useMemberFaces } from '@/features/you';
import { Scaffold } from '@/ui/surface/Scaffold';
import { setExploreAtHome, useExploreAtHome } from '@/lib/location';
import { useScreenHref } from '@/lib/navigation/screen-registry';

import { hatchEggCommand, setExploreAtHomeCommand } from '../data/commands';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { eggCardFor, hatchSeen, useHatchSeenVersion } from '../hatch/hatch-model';
import { useEncounter } from '../engine/use-encounter';
import { critterRoute, encounterRoute, hatchRoute, LEGENDARIES_ROUTE, setRoute } from '../routes';
import type { DexFilter } from './dex-model';
import { DexView } from './dex-view';
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

const LIVE = new Set(['accruing', 'ready', 'draining']);

export function PassScreen({ now = () => new Date() }: { readonly now?: () => Date }) {
  const data = useDexRows();
  const uid = useOwnerUid();
  const me = useLiveRows<MeRow>(ME_SQL, uid === null ? null : [uid], ME_TABLES).rows[0];
  // The way to the profile (and from there Settings) for someone with no crew yet: Home shows its
  // "HEY {NAME}" header only once there is one.
  const profileHref = useScreenHref(PROFILE_SCREEN);
  const faces = useMemberFaces();
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

  const focused = useIsFocused();

  const onHatch = () => {
    if (egg === null) return;
    void hatch.send({ trip_id: egg.tripId, trigger: egg.trigger ?? 'manual' });
    router.push(hatchRoute(egg.tripId));
  };

  if (!focused) return <Scaffold variant="dark" edges={['top']} testID="critters-dex-resting" />;

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
      onOpenLegendaries={() => router.push(LEGENDARIES_ROUTE)}
      profile={
        profileHref === undefined || me === undefined
          ? undefined
          : {
              name: me.display_name?.trim() ?? '',
              ...(uid === null ? {} : { face: faces.faceProps(uid, 'lg') }),
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
