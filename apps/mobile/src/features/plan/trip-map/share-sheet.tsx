/**
 * SHARE on the whole trip, the day plan and all days (undesigned; built from the sheet and pills):
 * share the plan through the share slot once the read-only link registers it, and "Add to my
 * calendar", which opens the plan's calendar export (moved here from the earlier calendar tab).
 */
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import type { TripPlan } from '@/data/plan/use-trip-plan';
import { PillButton } from '@/ui/buttons/PillButton';
import { Sheet } from '@/ui/sheet/Sheet';
import { makeStyles } from '@/ui/theme';

import { toPlanItems } from '../overview/model/plan-model';
import { PlanShareSlot } from '../overview/share-slot';
import { myEvents, useCalendarWriter } from '../views/data/calendar-export';
import { ExportSheet } from '../views/export-sheet';

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['24'], gap: t.space['12'] },
}));

export function ShareSheet({
  plan,
  onClose,
}: {
  readonly plan: TripPlan;
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
