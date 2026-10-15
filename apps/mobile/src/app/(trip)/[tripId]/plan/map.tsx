import { useLocalSearchParams } from 'expo-router';

import { CalendarWriterProvider, calendarWriter } from '@/features/plan';
import { dayParam, sheetParam } from '@/features/plan/hub/routes';
import { dateParam } from '@/features/plan/trip-map/chosen-day';
import { PlanMapScreen } from '@/features/plan/premium/plan-map/plan-map-screen';

import { nativeCpCalendarModule } from '../../../../../modules/cp-calendar/src/CpCalendarModule';

const writer = calendarWriter(nativeCpCalendarModule);

/**
 * The trip map (7a-1…7a-3, 7i-1): `/{tripId}/plan/map?day={n}&sheet=peek|half|full`, or
 * `?date=YYYY-MM-DD` to open on the day of that date; `?item=` opens a stop's details.
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

/** The plan on one map (4.25–4.27): the day in the sheet, the whole trip at full. */
export default function PlanMapRoute() {
  const { item } = useLocalSearchParams<{ item?: string }>();
  return (
    <CalendarWriterProvider value={writer}>
      <PlanMapScreen {...useMapParams()} item={item} />
    </CalendarWriterProvider>
  );
}
