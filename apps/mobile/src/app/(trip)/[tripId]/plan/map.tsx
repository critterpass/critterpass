import { useLocalSearchParams } from 'expo-router';

import { CalendarWriterProvider, calendarWriter } from '@/features/plan';
import { dayParam, sheetParam } from '@/features/plan/hub/routes';
import { dateParam } from '@/features/plan/trip-map/chosen-day';
import { PlanMapScreen } from '@/features/plan/premium/plan-map/plan-map-screen';
import { TripMapScreen } from '@/features/plan/trip-map/trip-map-screen';
import { premiumRoute } from '@/lib/premium-ui';

import { nativeCpCalendarModule } from '../../../../../modules/cp-calendar/src/CpCalendarModule';

const writer = calendarWriter(nativeCpCalendarModule);

/**
 * The trip map (7a-1…7a-3, 7i-1): `/{tripId}/plan/map?day={n}&sheet=peek|half|full`, or
 * `?date=YYYY-MM-DD` to open on the day of that date.
 */
function useMapParams() {
  const { tripId, day, date, sheet } = useLocalSearchParams<{
    tripId: string;
    day?: string;
    date?: string;
    sheet?: string;
  }>();
  return {
    tripId: tripId ?? '',
    day: dayParam(day),
    date: dateParam(date),
    sheet: sheetParam(sheet),
  };
}

function CurrentTripMapRoute() {
  return (
    <CalendarWriterProvider value={writer}>
      <TripMapScreen {...useMapParams()} />
    </CalendarWriterProvider>
  );
}

/** The plan on one map (4.25–4.27): the day in the sheet, the whole trip at full. */
function PremiumPlanMapRoute() {
  return (
    <CalendarWriterProvider value={writer}>
      <PlanMapScreen {...useMapParams()} />
    </CalendarWriterProvider>
  );
}

export default premiumRoute({ premium: PremiumPlanMapRoute, legacy: CurrentTripMapRoute });
