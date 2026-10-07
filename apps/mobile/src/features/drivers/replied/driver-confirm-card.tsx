/**
 * Once the crew's vote set the driver on his days: the offer to tell him on WhatsApp, shown on his
 * reply where the pick was. The message is written here; the traveller sends it.
 */
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['16'],
    gap: th.space['8'],
  },
}));

export interface DriverConfirmCardProps {
  readonly driverName: string;
  readonly dayCount: number;
  readonly onTell: () => void;
}

export function DriverConfirmCard({ driverName, dayCount, onTell }: DriverConfirmCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.card} testID="driver-reply-confirm">
      <Text variant="rowTitle" singleLine={false}>
        {t({
          id: 'drivers.replied.set',
          message: plural(dayCount, {
            one: `The crew said yes. ${driverName} is set on # day.`,
            other: `The crew said yes. ${driverName} is set on # days.`,
          }),
        })}
      </Text>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {t({
          id: 'drivers.replied.tellBody',
          message: "I'll write it with dates and pickup pins. You send it.",
        })}
      </Text>
      <PillButton
        tone="yellow"
        block
        label={t({ id: 'drivers.replied.tell', message: `Tell ${driverName} on WhatsApp` })}
        onPress={onTell}
        testID="driver-reply-tell"
      />
    </View>
  );
}
