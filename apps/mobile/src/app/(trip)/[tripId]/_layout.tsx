import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';

/** Every trip route (`/{tripId}/...`): keeps the trip's sync streams while any of them is open. */
export default function TripIdLayout() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  useTripStreams(tripId ?? null);
  return <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />;
}
