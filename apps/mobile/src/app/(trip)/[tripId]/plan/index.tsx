import { useLocalSearchParams } from 'expo-router';

import { CalendarWriterProvider, calendarWriter } from '@/features/plan';
import { PlanHubScreen } from '@/features/plan/hub/plan-hub-screen';

import { nativeCpCalendarModule } from '../../../../../modules/cp-calendar/src/CpCalendarModule';

// Null when the installed app predates the calendar write methods; the export sheet then leads
// with the subscribable feed.
const writer = calendarWriter(nativeCpCalendarModule);

/**
 * What the trip's PLAN opens (`/{tripId}/plan`): the trip map or a day plan, as `plan.hub` says,
 * with `planning.redesign` on; the earlier overview (3e-1) with it off.
 */
export default function PlanRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return (
    <CalendarWriterProvider value={writer}>
      <PlanHubScreen tripId={tripId ?? ''} />
    </CalendarWriterProvider>
  );
}
