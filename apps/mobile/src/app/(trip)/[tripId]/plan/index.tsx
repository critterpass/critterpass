import { useLocalSearchParams } from 'expo-router';

import { CalendarWriterProvider, calendarWriter, PlanScreen } from '@/features/plan';

import { nativeCpCalendarModule } from '../../../../../modules/cp-calendar/src/CpCalendarModule';

// Null when the installed app predates the calendar write methods; the export sheet then leads
// with the subscribable feed.
const writer = calendarWriter(nativeCpCalendarModule);

/** The trip plan overview (3e-1): `/{tripId}/plan`. */
export default function PlanRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return (
    <CalendarWriterProvider value={writer}>
      <PlanScreen tripId={tripId ?? ''} />
    </CalendarWriterProvider>
  );
}
