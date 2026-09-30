/**
 * The leave-by alarm's permission sheet, opened from the day-of screen's alarm line: ask for
 * alarms in context (iOS AlarmKit), explain Android's exact-alarm grant, say what happens when
 * alarms are off, or say plainly that this version rings a notification instead of an alarm.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export type AlarmSheetKind = 'ask' | 'exact' | 'denied' | 'notification';

export interface AlarmPermissionSheetProps {
  readonly kind: AlarmSheetKind;
  readonly guideName: string;
  readonly onPrimary: () => void;
  readonly onClose: () => void;
}

const useStyles = makeStyles((th) => ({
  body: { gap: th.space['16'], paddingBottom: th.space['8'] },
}));

export function AlarmPermissionSheet({
  kind,
  guideName,
  onPrimary,
  onClose,
}: AlarmPermissionSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const copy = {
    ask: {
      title: t({ id: 'trip.alarm.sheet.askTitle', message: 'Let leave-by alarms ring?' }),
      body: t({
        id: 'trip.alarm.sheet.askBody',
        message: `They ring through silent mode and Focus, only at leave-by times, and only if you're not up yet. ${guideName} stops ringing the moment you tap I'm up.`,
      }),
      primary: t({ id: 'trip.alarm.sheet.askAllow', message: 'Allow alarms' }),
    },
    exact: {
      title: t({ id: 'trip.alarm.sheet.exactTitle', message: 'Ring on the minute' }),
      body: t({
        id: 'trip.alarm.sheet.exactBody',
        message:
          'Android rings alarms on the minute only for apps you allow. Without it, a leave-by alarm can ring a few minutes late.',
      }),
      primary: t({ id: 'trip.alarm.sheet.exactOpen', message: 'Allow exact alarms' }),
    },
    denied: {
      title: t({ id: 'trip.alarm.sheet.deniedTitle', message: 'Alarms are off' }),
      body: t({
        id: 'trip.alarm.sheet.deniedBody',
        message: `This phone won't ring for leave-bys. ${guideName} rings here while the app is open, and your crew gets a nudge to knock if you sleep through.`,
      }),
      primary: t({ id: 'trip.alarm.sheet.deniedOpen', message: 'Open Settings' }),
    },
    notification: {
      title: t({
        id: 'trip.alarm.sheet.notificationTitle',
        message: 'A notification, not an alarm',
      }),
      body: t({
        id: 'trip.alarm.sheet.notificationBody',
        message:
          "On this version of the app a leave-by rings as a notification with I'm up and Snooze. It won't ring through silent mode, so keep the sound on tonight.",
      }),
      primary: t({ id: 'trip.alarm.sheet.notificationOk', message: 'Got it' }),
    },
  }[kind];
  return (
    <Sheet
      detents={['fit']}
      title={copy.title}
      onDismiss={onClose}
      testID={`trip-alarm-sheet-${kind}`}
    >
      <View style={styles.body}>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {copy.body}
        </Text>
        <PillButton
          label={copy.primary}
          block
          onPress={onPrimary}
          testID="trip-alarm-sheet-primary"
        />
      </View>
    </Sheet>
  );
}
