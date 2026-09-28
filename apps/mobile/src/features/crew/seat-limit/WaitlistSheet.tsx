/**
 * The default seat-limit presenter: says plainly that the trip is full at its cap and that the
 * invitee joins the waitlist and gets the next free seat, with that as the one action.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import type { SeatLimitPresenterProps } from './registry';

const useStyles = makeStyles((th) => ({
  body: { padding: th.space['20'], gap: th.space['16'], alignItems: 'stretch' },
}));

export function WaitlistSheet({
  detail,
  tripName,
  onWaitlist,
  onDismiss,
}: SeatLimitPresenterProps) {
  const styles = useStyles();
  const cap = detail.cap;
  const name = detail.invitee ?? t({ id: 'crew.seatLimit.someone', message: 'They' });
  return (
    <Sheet detents={['fit']} onDismiss={onDismiss} testID="seat-limit-waitlist">
      <View style={styles.body}>
        <Text variant="h2" accessibilityRole="header">
          {t({ id: 'crew.seatLimit.title', message: `${tripName} is full` })}
        </Text>
        <Text variant="body">
          {t({
            id: 'crew.seatLimit.body',
            message: `${tripName} is full at ${cap}. ${name} joins the waitlist and gets the next free seat.`,
          })}
        </Text>
        <PillButton
          label={t({ id: 'crew.seatLimit.waitlist', message: 'Add to the waitlist' })}
          onPress={onWaitlist}
          block
          testID="seat-limit-waitlist-confirm"
        />
        <InlineAction
          label={t({ id: 'crew.seatLimit.notNow', message: 'Not now' })}
          onPress={onDismiss}
        />
      </View>
    </Sheet>
  );
}
