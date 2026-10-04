import { useLocalSearchParams } from 'expo-router';

import { CalendarWriterProvider, calendarWriter } from '@/features/plan';
import { AllDaysScreen } from '@/features/plan/all-days/all-days-screen';

import { nativeCpCalendarModule } from '../../../../../modules/cp-calendar/src/CpCalendarModule';

const writer = calendarWriter(nativeCpCalendarModule);

/** All days (7b-3): `/{tripId}/plan/days?from={n}`, the day it was opened from. */
export default function AllDaysRoute() {
  const { tripId, from } = useLocalSearchParams<{ tripId: string; from?: string }>();
  return (
    <CalendarWriterProvider value={writer}>
      <AllDaysScreen tripId={tripId ?? ''} from={from === undefined ? null : Number(from)} />
    </CalendarWriterProvider>
  );
}
