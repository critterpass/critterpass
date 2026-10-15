import { useMemo } from 'react';
import { Share } from 'react-native';
import { useLocale } from '@/lib/i18n/use-locale';
import type { TripPlan } from '@/data/plan/use-trip-plan';
import { toPlanItems } from '../../overview/model/plan-model';
import { myEvents } from '../../views/data/calendar-export';
import { planShareText } from '../../trip-map/share-text';
import type { TripDay } from '../../trip-map/trip-days';

/** The plan's events of mine for the calendar export, as both looks of the share sheet read them. */
export function useMyPlanEvents(plan: TripPlan) {
  const locale = useLocale();
  return useMemo(
    () =>
      myEvents(
        toPlanItems(plan.itemRows, locale, plan.places),
        plan.uid ?? '',
        plan.trip?.tz ?? null,
      ),
    [plan.itemRows, plan.places, plan.uid, plan.trip?.tz, locale],
  );
}

/** The plan, day by day, as the text "Send the plan" hands to the phone's share sheet. */
export function sharePlanText(plan: TripPlan, days: readonly TripDay[], locale: string): void {
  const message = planShareText({
    locale,
    destination: plan.trip?.destination_name ?? null,
    startDate: plan.trip?.start_date ?? null,
    endDate: plan.trip?.end_date ?? null,
    days,
  });
  // The person may close the phone's share sheet without sending: nothing to report.
  void Share.share({ message }).catch(() => undefined);
}
