import { useLocalSearchParams } from 'expo-router';

import { ChangeDaySheet } from '@/features/plan/draft';

/** The change-a-day sheet over the draft (`/{tripId}/draft/change-day?day=&free=`). */
export default function ChangeDayRoute() {
  const { tripId, day, free } = useLocalSearchParams<{
    tripId: string;
    day?: string;
    free?: string;
  }>();
  const initialDay = day === undefined ? null : Number(day) || null;
  return <ChangeDaySheet tripId={tripId} initialDay={initialDay} free={free === '1'} />;
}
