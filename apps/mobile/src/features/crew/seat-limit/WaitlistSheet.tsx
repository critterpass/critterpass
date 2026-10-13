/**
 * The default seat-limit presenter: says plainly that the trip is full at its cap and that the
 * invitee joins the waitlist and gets the next free seat, with that as the one action. A sheet
 * that rises over the screen that asked (the dimmed page or Not now puts it away). Undesigned in
 * the premium set: built from the kit's sheet radius, ground and buttons.
 */
import { t } from '@lingui/core/macro';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import type { SeatLimitPresenterProps } from './registry';

// eslint-disable-next-line critterpass/no-literal-style, lingui/no-unlocalized-strings -- the sheet scrim the premium tokens do not carry yet
const SCRIM = 'rgba(20,22,40,.3)';

export function WaitlistSheet({
  detail,
  tripName,
  onWaitlist,
  onDismiss,
}: SeatLimitPresenterProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const cap = detail.cap;
  const name = detail.invitee ?? t({ id: 'crew.seatLimit.someone', message: 'They' });
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss}>
      <View style={styles.fill}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM }]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'crew.seatLimit.notNow', message: 'Not now' })}
        />
        <View
          style={[
            styles.sheet,
            {
              borderRadius: th.radius.sheet,
              backgroundColor: th.color.ground,
              marginBottom: insets.bottom + 8,
              padding: th.space.gutter,
              gap: th.space.gap16,
            },
          ]}
          testID="seat-limit-waitlist"
        >
          <Text variant="title" accessibilityRole="header">
            {t({ id: 'crew.seatLimit.title', message: `${tripName} is full` })}
          </Text>
          <Text variant="body" tone="muted">
            {t({
              id: 'crew.seatLimit.body',
              message: `${tripName} is full at ${cap}. ${name} joins the waitlist and gets the next free seat.`,
            })}
          </Text>
          <Button
            label={t({ id: 'crew.seatLimit.waitlist', message: 'Add to the waitlist' })}
            onPress={onWaitlist}
            testID="seat-limit-waitlist-confirm"
          />
          <TextButton
            label={t({ id: 'crew.seatLimit.notNow', message: 'Not now' })}
            align="center"
            onPress={onDismiss}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  sheet: { marginHorizontal: 8 },
});
