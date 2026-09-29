import { useLocalSearchParams } from 'expo-router';

import { LastRedraftSheet, parseReasons } from '@/features/plan/draft';

/** The last-free-redraft interstitial, holding the redraft it will send. */
export default function LastRedraftRoute() {
  const params = useLocalSearchParams<{
    tripId: string;
    day: string;
    reasons?: string;
    note?: string;
    free?: string;
  }>();
  return (
    <LastRedraftSheet
      tripId={params.tripId}
      day={Number(params.day) || 1}
      reasons={parseReasons(params.reasons)}
      note={params.note ?? ''}
      free={params.free === '1'}
    />
  );
}
