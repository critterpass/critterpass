import { useLocalSearchParams } from 'expo-router';

import { GapSheet } from '@/features/plan/check';

/** Fill a gap (7h-2): `/{tripId}/check/gap?dayId|day&start&end`, a sheet over the trip map. */
export default function GapRoute() {
  const params = useLocalSearchParams<{
    tripId: string;
    dayId?: string;
    day?: string;
    start: string;
    end: string;
  }>();
  return (
    <GapSheet
      tripId={params.tripId ?? ''}
      dayId={params.dayId ?? ''}
      dayNo={params.day === undefined || params.day === '' ? null : Number(params.day)}
      start={params.start ?? ''}
      end={params.end ?? ''}
    />
  );
}
