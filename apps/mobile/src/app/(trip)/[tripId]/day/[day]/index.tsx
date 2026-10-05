import { useLocalSearchParams } from 'expo-router';

import { CalendarWriterProvider, calendarWriter } from '@/features/plan';
import { DayScreen } from '@/features/plan/day/day-screen';
import { DayPlanScreen } from '@/features/plan/day-plan/day-plan-screen';
import { dateParam } from '@/features/plan/trip-map/chosen-day';
import { usePlanningSwitch } from '@/lib/navigation/planning-switch';

import { nativeCpCalendarModule } from '../../../../../../modules/cp-calendar/src/CpCalendarModule';

const writer = calendarWriter(nativeCpCalendarModule);

/**
 * One day of the trip plan (`/{tripId}/day/{n}`): the day plan (7b-1) with `planning.redesign`
 * on, else the earlier day view (3e-2: the list, or the timeline in planning mode).
 * `?item={stable_id}` opens that item's sheet on arrival. The day plan also opens on a day named
 * by its date (`/{tripId}/day/2026-10-07`, or `?date=`), for a link that knows the date only.
 */
export default function PlanDayRoute() {
  const { tripId, day, date, item } = useLocalSearchParams<{
    tripId: string;
    day: string;
    date?: string;
    item?: string;
  }>();
  const { redesign } = usePlanningSwitch();
  if (!redesign) return <DayScreen tripId={tripId} dayNo={Number(day)} item={item} />;
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
