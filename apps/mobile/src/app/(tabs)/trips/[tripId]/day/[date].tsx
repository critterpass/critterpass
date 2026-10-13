/* eslint-disable lingui/no-unlocalized-strings -- route paths, not copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { DayOfScreen } from '@/features/trip/day-of/day-of-screen';
import { TODAY } from '@/features/trip/hub/routes';
import { LocalFirstGate } from '@/features/trip/hub/local-first-gate';
import { premiumRoute } from '@/lib/premium-ui';

function useDay(): { readonly tripId: string | null; readonly date: string } {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date: string }>();
  return { tripId: typeof tripId === 'string' ? tripId : null, date: date ?? TODAY };
}

/** The day-of screen (3k-2) in the TRIPS tab; `today` is the trip's own today. */
function DayInTab() {
  const { tripId, date } = useDay();
  if (tripId === null) return null;
  return (
    <LocalFirstGate>
      <DayOfScreen tripId={tripId} date={date} />
    </LocalFirstGate>
  );
}

/** The premium UI shows the day-of page (6.04, 6.05) on the hub's stack over the tabs. */
function DayOverHub() {
  const { tripId, date } = useDay();
  return (
    <Redirect
      href={
        tripId === null
          ? '/(tabs)/trips'
          : { pathname: '/(trip)/hub/[tripId]/day/[date]', params: { tripId, date } }
      }
    />
  );
}

export default premiumRoute({ premium: DayOverHub, legacy: DayInTab });
