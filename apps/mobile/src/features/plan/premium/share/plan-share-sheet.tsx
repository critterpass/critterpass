/**
 * Sharing the plan in the premium look (undesigned; built from the in-page sheet and buttons):
 * "Send the plan" hands it, day by day, to the phone's share sheet, the slot adds what other areas
 * offer (a driver or guide), and "Add to my calendar" turns the sheet into the calendar export.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Button } from '@/ui/premium';

import { PremiumPlanShareSlot } from '../../overview/share-slot';
import { sharePlanText, useMyPlanEvents } from './share-plan';
import { type ShareSheetProps } from '../../all-days/all-days-props';
import { useCalendarWriter } from '../../views/data/calendar-export';
import { ExportSheet } from '../../views/export-sheet';
import { OverlaySheet } from '../sheets/overlay-sheet';
import { PremiumExportView } from './export-view';

export function PremiumPlanShareSheet(props: ShareSheetProps) {
  const { plan, days, onClose } = props;
  const locale = useLocale();
  const writer = useCalendarWriter();
  const events = useMyPlanEvents(plan);
  const [calendar, setCalendar] = useState(false);
  const tripId = plan.trip?.id ?? '';
  if (calendar) {
    return (
      <ExportSheet
        tripId={tripId}
        events={events}
        writer={writer}
        onClose={onClose}
        View={PremiumExportView}
      />
    );
  }
  return (
    <OverlaySheet
      title={t({ id: 'plan.tripMap.shareTitle', message: 'Share the plan' })}
      closeLabel={t({ id: 'plan.premium.share.close', message: 'Close' })}
      onDismiss={onClose}
      testID="plan-share-sheet"
    >
      <View style={styles.body}>
        <Button
          label={t({ id: 'plan.tripMap.sendPlan', message: 'Send the plan' })}
          icon="share"
          onPress={() => sharePlanText(plan, days, locale)}
          testID="plan-share-send"
        />
        <PremiumPlanShareSlot tripId={tripId} />
        <Button
          label={t({ id: 'plan.tripMap.addToCalendar', message: 'Add to my calendar' })}
          variant="secondary"
          onPress={() => setCalendar(true)}
          testID="plan-share-calendar"
        />
      </View>
    </OverlaySheet>
  );
}

const styles = StyleSheet.create({ body: { gap: 12 } });
