import { useLocalSearchParams } from 'expo-router';

import { CalendarWriterProvider, calendarWriter } from '@/features/plan';
import { dayParam, sheetParam } from '@/features/plan/hub/routes';
import { TripMapScreen } from '@/features/plan/trip-map/trip-map-screen';

import { nativeCpCalendarModule } from '../../../../../modules/cp-calendar/src/CpCalendarModule';

const writer = calendarWriter(nativeCpCalendarModule);

/** The trip map (7a-1…7a-3, 7i-1): `/{tripId}/plan/map?day={n}&sheet=peek|half|full`. */
export default function TripMapRoute() {
  const { tripId, day, sheet } = useLocalSearchParams<{
    tripId: string;
    day?: string;
    sheet?: string;
  }>();
  return (
    <CalendarWriterProvider value={writer}>
      <TripMapScreen tripId={tripId ?? ''} day={dayParam(day)} sheet={sheetParam(sheet)} />
    </CalendarWriterProvider>
  );
}
