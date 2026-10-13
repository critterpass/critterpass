/* eslint-disable lingui/no-unlocalized-strings -- route names, never copy. */
import { useLocalSearchParams } from 'expo-router';

import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { isTripId } from '@/features/trip/access/trip-access';
import { useTripAccess } from '@/features/trip/access/use-trip-access';
import { sheetScreens } from '@/lib/navigation/sheet-routes';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';
import { sheetRouteOptions } from '@/ui/premium/shell';
import { SELF_ANIMATED_SHEET } from '@/ui/premium/shell/navigation/premium-root-stack';

import NotFoundScreen from '../../+not-found';

/** Sheets drawn as native form sheets; the rest animate themselves. */
const NATIVE_SHEETS: ReadonlySet<string> = new Set([
  'add/[placeId]',
  'search/link',
  'check/gap',
  'drivers/pick',
]);

/**
 * Every trip route (`/{tripId}/...`): keeps the trip's sync streams while any of them is open. A
 * first segment that is no trip id (`/nowhere-at-all`), or the id of a trip this person cannot
 * read, gets the not-found page with its way home instead of a trip screen with nothing behind it.
 */
export default function TripIdLayout() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trip = isTripId(tripId) ? tripId : null;
  useTripStreams(trip);
  const access = useTripAccess(trip);
  if (trip === null || access === 'missing') return <NotFoundScreen />;
  // A native stack, so push pages get the native bar and glass back.
  return (
    <PremiumStack>
      {sheetScreens('(trip)/[tripId]')
        .filter((name) => !NATIVE_SHEETS.has(name))
        .map((name) => (
          <PremiumStackScreen key={name} name={name} options={SELF_ANIMATED_SHEET} />
        ))}
      {/* Changing the dates rises as a modal with its ✕ (4.54). */}
      <PremiumStackScreen name="settings/dates" options={{ presentation: 'modal' }} />
      {/* Add to plan rises over the map, its top still showing (4.39). */}
      <PremiumStackScreen
        name="add/[placeId]"
        options={{ ...sheetRouteOptions('full'), sheetAllowedDetents: [0.79, 1] }}
      />
      {/* Add from a link rises nearly full over Find (4.32). */}
      <PremiumStackScreen
        name="search/link"
        options={{ ...sheetRouteOptions('full'), sheetAllowedDetents: [0.9, 1] }}
      />
      {/* Filling a gap rises over the map (4.44). */}
      <PremiumStackScreen
        name="check/gap"
        options={{ ...sheetRouteOptions('full'), sheetAllowedDetents: [0.62, 1] }}
      />
      {/* Picking a driver's days rises over Compare, its list scrolling inside (6.23). */}
      <PremiumStackScreen
        name="drivers/pick"
        options={{ ...sheetRouteOptions('full'), sheetAllowedDetents: [0.6, 1] }}
      />
      {/* Ideas rises over the plan map, leaving its top showing (4.40). */}
      <PremiumStackScreen
        name="ideas/index"
        options={{ ...sheetRouteOptions('full'), sheetAllowedDetents: [0.82, 1] }}
      />
    </PremiumStack>
  );
}
