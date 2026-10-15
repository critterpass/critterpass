/* eslint-disable lingui/no-unlocalized-strings -- a route path and params, never copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { dateParam } from '@/features/plan/trip-map/chosen-day';

type DayParams = {
  tripId: string;
  day: string;
  date?: string;
  item?: string;
};

/** The plan is one map: a day is that map with the day at half (4.26). */
export default function DayRoute() {
  const { tripId, day, date, item } = useLocalSearchParams<DayParams>();
  const onDate = dateParam(date) ?? dateParam(day);
  return (
    <Redirect
      href={{
        pathname: '/[tripId]/plan/map',
        params: {
          tripId,
          sheet: 'half',
          ...(onDate === null ? { day } : { date: onDate }),
          ...(item === undefined ? {} : { item }),
        },
      }}
    />
  );
}
