import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { TripAccessGate } from '@/features/trip/access/trip-access-gate';
import { TripStreams } from '@/features/trip/hub/local-first-gate';
import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui/theme';

/**
 * One trip inside the TRIPS tab: keeps the trip's sync streams while its hub or a day is open, and
 * shows the "not here" page for a trip this person cannot read.
 */
export default function TripHubLayout() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  return (
    <TripAccessGate tripId={tripId}>
      <TripStreams tripId={typeof tripId === 'string' ? tripId : null} />
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
    </TripAccessGate>
  );
}
