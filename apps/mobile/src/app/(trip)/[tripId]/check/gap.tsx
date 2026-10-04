import { useLocalSearchParams } from 'expo-router';

import { GapSheet } from '@/features/plan/check';

/** Fill a gap (7h-2): `/{tripId}/check/gap?dayId&start&end`, a sheet over the trip map. */
export default function GapRoute() {
  const params = useLocalSearchParams<{
    tripId: string;
    dayId: string;
    start: string;
    end: string;
  }>();
  return (
    <GapSheet
      tripId={params.tripId ?? ''}
      dayId={params.dayId ?? ''}
      start={params.start ?? ''}
      end={params.end ?? ''}
    />
  );
}
