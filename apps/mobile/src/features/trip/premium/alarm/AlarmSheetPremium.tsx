/**
 * The leave-by alarm's permission sheet, opened from the day page's alarm line (a native fit
 * sheet): ask for alarms in context, explain Android's exact-alarm grant, say what happens when
 * alarms are off, or say plainly that this version rings a notification instead of an alarm.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Text, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { runAlarmSheetPrimary } from '../../alarm/alarm-sheet-action';
import type { AlarmSheetKind } from '../../alarm/view-types';

function useSheetCopy(kind: AlarmSheetKind, guideName: string) {
  const { t } = useLingui();
  switch (kind) {
    case 'ask':
      return {
        title: t({ id: 'trip.alarm.sheet.askTitle', message: 'Let leave-by alarms ring?' }),
        body: t({
          id: 'trip.alarm.sheet.askBody',
          message: `They ring through silent mode and Focus, only at leave-by times, and only if you’re not up yet. ${guideName} stops ringing the moment you tap I’m up.`,
        }),
        primary: t({ id: 'trip.alarm.sheet.askAllow', message: 'Allow alarms' }),
      };
    case 'exact':
      return {
        title: t({ id: 'trip.alarm.sheet.exactTitle', message: 'Ring on the minute' }),
        body: t({
          id: 'trip.alarm.sheet.exactBody',
          message:
            'Android rings alarms on the minute only for apps you allow. Without it, a leave-by alarm can ring a few minutes late.',
        }),
        primary: t({ id: 'trip.alarm.sheet.exactOpen', message: 'Allow exact alarms' }),
      };
    case 'denied':
      return {
        title: t({ id: 'trip.alarm.sheet.deniedTitle', message: 'Alarms are off' }),
        body: t({
          id: 'trip.alarm.sheet.deniedBody',
          message: `This phone won’t ring for leave-bys. ${guideName} rings here while the app is open, and your crew gets a nudge to knock if you sleep through.`,
        }),
        primary: t({ id: 'trip.alarm.sheet.deniedOpen', message: 'Open Settings' }),
      };
    case 'notification':
      return {
        title: t({
          id: 'trip.alarm.sheet.notificationTitle',
          message: 'A notification, not an alarm',
        }),
        body: t({
          id: 'trip.alarm.sheet.notificationBody',
          message:
            'On this version of the app a leave-by rings as a notification with I’m up and Snooze. It won’t ring through silent mode, so keep the sound on tonight.',
        }),
        primary: t({ id: 'trip.alarm.sheet.notificationOk', message: 'Got it' }),
      };
  }
}

export function AlarmSheetPremium({
  kind,
  guideName,
}: {
  readonly kind: AlarmSheetKind;
  readonly guideName: string;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const copy = useSheetCopy(kind, guideName);
  const primary = () => {
    if (router.canGoBack()) router.back();
    void runAlarmSheetPrimary(kind);
  };
  return (
    <SheetScreen
      title={copy.title}
      cancelLabel={t({ id: 'common.confirm.cancel', message: 'Cancel' })}
      scroll={false}
      testID={`trip-alarm-sheet-${kind}`}
    >
      <View style={{ gap: th.space.gap16, paddingTop: th.space.gap8 }}>
        <Text variant="body" tone="inkSecondary">
          {copy.body}
        </Text>
        <Button label={copy.primary} onPress={primary} testID="trip-alarm-sheet-primary" />
      </View>
    </SheetScreen>
  );
}
