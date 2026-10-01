import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';

import NotFoundScreen from '../../+not-found';

/** A trip id is a UUID; `/{tripId}` itself matches any one-segment path. */
const TRIP_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/**
 * Every trip route (`/{tripId}/...`): keeps the trip's sync streams while any of them is open. A
 * first segment that is no trip id is an unknown link (`/nowhere-at-all`), and gets the not-found
 * page with its way home instead of a trip screen with nothing behind it.
 */
export default function TripIdLayout() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const isTrip = typeof tripId === 'string' && TRIP_ID.test(tripId);
  useTripStreams(isTrip ? tripId : null);
  if (!isTrip) return <NotFoundScreen />;
  return <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />;
}
