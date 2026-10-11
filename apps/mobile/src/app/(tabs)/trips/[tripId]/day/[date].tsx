import { useLocalSearchParams } from 'expo-router';

import { DayOfScreen } from '@/features/trip/day-of/day-of-screen';
import { TODAY } from '@/features/trip/hub/routes';
import { LocalFirstGate } from '@/features/trip/hub/local-first-gate';
import { DayOfPremium } from '@/features/trip/premium/day/DayOfPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** The day-of screen (3k-2, 6.04, 6.05) for one trip date; `today` is the trip's own today. */
export default function TripDayRoute() {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date: string }>();
  const premium = usePremiumUi();
  if (typeof tripId !== 'string') return null;
  const day = typeof date === 'string' ? date : TODAY;
  return (
    <LocalFirstGate>
      {premium ? <DayOfPremium tripId={tripId} date={day} /> : <DayOfScreen tripId={tripId} date={day} />}
    </LocalFirstGate>
  );
}
