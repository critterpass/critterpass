import { useLocalSearchParams } from 'expo-router';

import { DayOfScreen } from '@/features/trip/day-of/day-of-screen';
import { TODAY } from '@/features/trip/hub/routes';
import { LocalFirstGate } from '@/features/trip/hub/local-first-gate';

/** The day-of screen (3k-2) for one trip date; `today` is the trip's own today. */
export default function TripDayRoute() {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date: string }>();
  if (typeof tripId !== 'string') return null;
  return (
    <LocalFirstGate>
      <DayOfScreen tripId={tripId} date={typeof date === 'string' ? date : TODAY} />
    </LocalFirstGate>
  );
}
