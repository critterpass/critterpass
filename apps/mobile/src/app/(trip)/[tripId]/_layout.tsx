import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { isTripId } from '@/features/trip/access/trip-access';
import { useTripAccess } from '@/features/trip/access/use-trip-access';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';

import NotFoundScreen from '../../+not-found';

/**
 * Every trip route (`/{tripId}/...`): keeps the trip's sync streams while any of them is open. A
 * first segment that is no trip id (`/nowhere-at-all`), or the id of a trip this person cannot
 * read, gets the not-found page with its way home instead of a trip screen with nothing behind it.
 */
export default function TripIdLayout() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const trip = isTripId(tripId) ? tripId : null;
  useTripStreams(trip);
  const access = useTripAccess(trip);
  if (trip === null || access === 'missing') return <NotFoundScreen />;
  return (
    <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
      {/* Add to plan rises as a sheet over the screen that opened it. */}
      {/* eslint-disable-next-line lingui/no-unlocalized-strings -- a route name, never copy. */}
      <Stack.Screen name="add/[placeId]" options={modalGroupOptions()} />
    </Stack>
  );
}
