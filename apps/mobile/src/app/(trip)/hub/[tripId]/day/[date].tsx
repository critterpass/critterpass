/* eslint-disable lingui/no-unlocalized-strings -- route paths, not copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { TODAY } from '@/features/trip/hub/routes';
import { LocalFirstGate } from '@/features/trip/hub/local-first-gate';
import { DayOfPremium } from '@/features/trip/premium/day/DayOfPremium';
import { premiumRoute } from '@/lib/premium-ui';

function useDay(): { readonly tripId: string | null; readonly date: string } {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date: string }>();
  return { tripId: typeof tripId === 'string' ? tripId : null, date: date ?? TODAY };
}

/** The day-of page (6.04, 6.05) pushed on the hub's stack, over the tabs. */
function DayOverHub() {
  const { tripId, date } = useDay();
  if (tripId === null) return null;
  return (
    <LocalFirstGate>
      <DayOfPremium tripId={tripId} date={date} />
    </LocalFirstGate>
  );
}

/** The current UI keeps the day-of page in the TRIPS tab. */
function DayInTab() {
  const { tripId, date } = useDay();
  return (
    <Redirect
      href={
        tripId === null
          ? '/(tabs)/trips'
          : { pathname: '/(tabs)/trips/[tripId]/day/[date]', params: { tripId, date } }
      }
    />
  );
}

export default premiumRoute({ premium: DayOverHub, legacy: DayInTab });
