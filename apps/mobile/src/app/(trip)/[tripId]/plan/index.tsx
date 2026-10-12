import { Redirect, useLocalSearchParams } from 'expo-router';

import { CalendarWriterProvider, calendarWriter } from '@/features/plan';
import { PlanHubScreen } from '@/features/plan/hub/plan-hub-screen';
import { tripPlanRoutes } from '@/features/plan/hub/routes';
import { premiumRoute } from '@/lib/premium-ui';

import { nativeCpCalendarModule } from '../../../../../modules/cp-calendar/src/CpCalendarModule';

// Null when the installed app predates the calendar write methods; the export sheet then leads
// with the subscribable feed.
const writer = calendarWriter(nativeCpCalendarModule);

/**
 * What the trip's PLAN opens (`/{tripId}/plan`): the trip map or a day plan, as `plan.hub` says.
 */
function CurrentPlanRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return (
    <CalendarWriterProvider value={writer}>
      <PlanHubScreen tripId={tripId ?? ''} />
    </CalendarWriterProvider>
  );
}

/** The premium plan is one map (4.25–4.27): PLAN replaces itself with it. */
function PremiumPlanRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <Redirect href={tripPlanRoutes.map(tripId ?? '')} />;
}

export default premiumRoute({ premium: PremiumPlanRoute, legacy: CurrentPlanRoute });
