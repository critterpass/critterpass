import { useLocalSearchParams } from 'expo-router';

import { GettingAroundScreen } from '@/features/bookings/getting-around/GettingAroundScreen';

/** Getting around (3h-3): the next leg, a ride, the phrase card and today's later legs. */
export default function GettingAroundRoute() {
  const params = useLocalSearchParams<{ tripId?: string; to?: string; from?: string }>();
  return (
    <GettingAroundScreen
      ask={{
        ...(params.tripId ? { tripId: params.tripId } : {}),
        ...(params.to ? { to: params.to } : {}),
        ...(params.from ? { from: params.from } : {}),
      }}
    />
  );
}
