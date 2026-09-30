import { useLocalSearchParams } from 'expo-router';

import { DayOfScreen } from '@/features/trip/day-of/day-of-screen';
import { TODAY } from '@/features/trip/hub/routes';

/** The day-of screen (3k-2) for one trip date; `today` is the trip's own today. */
export default function TripDayRoute() {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date: string }>();
  if (typeof tripId !== 'string') return null;
  return <DayOfScreen tripId={tripId} date={typeof date === 'string' ? date : TODAY} />;
}
