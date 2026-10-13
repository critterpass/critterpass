/* eslint-disable lingui/no-unlocalized-strings -- a route path and params, never copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { CalendarWriterProvider, calendarWriter } from '@/features/plan';
import { DayPlanScreen } from '@/features/plan/day-plan/day-plan-screen';
import { dateParam } from '@/features/plan/trip-map/chosen-day';
import { premiumRoute } from '@/lib/premium-ui';

import { nativeCpCalendarModule } from '../../../../../../modules/cp-calendar/src/CpCalendarModule';

const writer = calendarWriter(nativeCpCalendarModule);

interface DayParams {
  readonly tripId: string;
  readonly day: string;
  readonly date?: string;
  readonly item?: string;
}

/**
 * One day of the trip plan (`/{tripId}/day/{n}`): the day plan (7b-1).
 * `?item={stable_id}` opens that item's sheet on arrival. The day plan also opens on a day named
 * by its date (`/{tripId}/day/2026-10-07`, or `?date=`), for a link that knows the date only.
 */
function CurrentDayRoute() {
  const { tripId, day, date, item } = useLocalSearchParams<DayParams>();
  return (
    <CalendarWriterProvider value={writer}>
      <DayPlanScreen
        tripId={tripId}
        dayNo={Number(day)}
        date={dateParam(date) ?? dateParam(day)}
        item={item}
      />
    </CalendarWriterProvider>
  );
}

/** The premium plan is one map: a day is that map with the day at half (4.26). */
function PremiumDayRoute() {
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

export default premiumRoute({ premium: PremiumDayRoute, legacy: CurrentDayRoute });
