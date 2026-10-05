/**
 * SHARE on the whole trip, the day plan and all days (undesigned; built from the sheet and pills):
 * "Send the plan" hands the plan, day by day, to the phone's share sheet as text (the crew's
 * group chat); the read-only link joins it through the share slot once it registers; and "Add to
 * my calendar" opens the plan's calendar export (moved here from the earlier calendar tab).
 */
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import type { TripPlan } from '@/data/plan/use-trip-plan';
import { PillButton } from '@/ui/buttons/PillButton';
import { Sheet } from '@/ui/sheet/Sheet';
import { makeStyles } from '@/ui/theme';

import { toPlanItems } from '../overview/model/plan-model';
import { PlanShareSlot } from '../overview/share-slot';
import { myEvents, useCalendarWriter } from '../views/data/calendar-export';
import { ExportSheet } from '../views/export-sheet';
import { planShareText } from './share-text';
import type { TripDay } from './trip-days';

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['24'], gap: t.space['12'] },
}));

export function ShareSheet({
  plan,
  days,
  onClose,
}: {
  readonly plan: TripPlan;
  /** The plan's days as the screen shows them. */
  readonly days: readonly TripDay[];
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const writer = useCalendarWriter();
  const [calendar, setCalendar] = useState(false);
  const tripId = plan.trip?.id ?? '';
  const events = useMemo(
    () =>
      myEvents(
        toPlanItems(plan.itemRows, locale, plan.places),
        plan.uid ?? '',
        plan.trip?.tz ?? null,
      ),
    [plan.itemRows, plan.places, plan.uid, plan.trip?.tz, locale],
  );
  if (calendar) {
    return <ExportSheet tripId={tripId} events={events} writer={writer} onClose={onClose} />;
  }
  return (
    <Sheet
      detents={['fit']}
      title={t({ id: 'plan.tripMap.shareTitle', message: 'Share the plan' })}
      onDismiss={onClose}
      testID="plan-share-sheet"
    >
      <View style={styles.body}>
        <PillButton
          label={t({ id: 'plan.tripMap.sendPlan', message: 'Send the plan' })}
          block
          onPress={() => {
            const message = planShareText({
              locale,
              destination: plan.trip?.destination_name ?? null,
              startDate: plan.trip?.start_date ?? null,
              endDate: plan.trip?.end_date ?? null,
              days,
            });
            // The person may close the phone's share sheet without sending: nothing to report.
            void Share.share({ message }).catch(() => undefined);
          }}
          testID="plan-share-send"
        />
        <PlanShareSlot tripId={tripId} />
        <PillButton
          label={t({ id: 'plan.tripMap.addToCalendar', message: 'Add to my calendar' })}
          variant="secondary"
          block
          onPress={() => setCalendar(true)}
          testID="plan-share-calendar"
        />
      </View>
    </Sheet>
  );
}
