/* eslint-disable lingui/no-unlocalized-strings -- route paths, not copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { TODAY } from '@/features/trip/hub/routes';

function useDay(): { readonly tripId: string | null; readonly date: string } {
  const { tripId, date } = useLocalSearchParams<{ tripId: string; date: string }>();
  return { tripId: typeof tripId === 'string' ? tripId : null, date: date ?? TODAY };
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

export default DayOverHub;
