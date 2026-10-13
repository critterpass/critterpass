/**
 * Once the crew's vote set the driver on his days: the offer to tell him on WhatsApp, shown on his
 * reply where the pick was. The message is written here; the traveller sends it.
 */
import { plural, t } from '@lingui/core/macro';
import { StyleSheet } from 'react-native';

import { Button, Card, Text } from '@/ui/premium';

export interface DriverConfirmCardProps {
  readonly driverName: string;
  readonly dayCount: number;
  readonly onTell: () => void;
}

export function DriverConfirmCard({ driverName, dayCount, onTell }: DriverConfirmCardProps) {
  return (
    <Card padded style={styles.card} testID="driver-reply-confirm">
      <Text variant="rowTitle" singleLine={false}>
        {t({
          id: 'drivers.replied.set',
          message: plural(dayCount, {
            one: `The crew said yes. ${driverName} is set on # day.`,
            other: `The crew said yes. ${driverName} is set on # days.`,
          }),
        })}
      </Text>
      <Text variant="rowText" tone="muted">
        {t({
          id: 'drivers.replied.tellBody',
          message: "I'll write it with dates and pickup pins. You send it.",
        })}
      </Text>
      <Button
        label={t({ id: 'drivers.replied.tell', message: `Tell ${driverName} on WhatsApp` })}
        onPress={onTell}
        testID="driver-reply-tell"
      />
    </Card>
  );
}

const styles = StyleSheet.create({ card: { gap: 8 } });
