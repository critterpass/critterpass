/**
 * The mailbox sheet's frame (7.05) inside its native form sheet route: the sheet material under
 * the content, below the system grabber on iOS and with a drawn grabber on Android. And the
 * "With Pass+" badge under its actions, and the forward address to copy.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useBackAffordance } from '@/lib/qa/back-affordance';
import { buttonLook, PressableScale, Text, usePremiumTheme, type PremiumTheme } from '@/ui/premium';
import { sheetMaterialStyle } from '@/ui/premium/shell';

/**
 * The sheet's surface: the native sheet draws the grabber and the swipe down on iOS, which is its
 * way back as the design draws it; on Android the sheet's "Done" is. Either way the sheet has one.
 */
export function MailboxSheetFrame(props: { readonly children: ReactNode }) {
  const th = usePremiumTheme();
  useBackAffordance();
  return (
    <View style={[styles.fill, styles.sheet, sheetMaterialStyle(th)]} testID="bookings-mailbox">
      {Platform.OS === 'android' ? (
        <View style={[styles.grabber, { backgroundColor: th.color.outlineEmpty }]} />
      ) : null}
      {props.children}
    </View>
  );
}

export function MailboxPassBadge(props: {
  readonly th: PremiumTheme;
  readonly onPress: (() => void) | null;
}) {
  const { t } = useLingui();
  const label = t({ id: 'bookings.mailboxRow.locked', message: 'With Pass+' });
  const badge = (
    <View style={[styles.badge, { backgroundColor: props.th.accent.sun }]}>
      <Text variant="tier" color={props.th.color.onAccent}>
        {label}
      </Text>
    </View>
  );
  if (props.onPress === null) return badge;
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={t({ id: 'bookings.mailbox.seePass', message: 'See Pass+' })}
      testID="bookings-mailbox-see-pass"
    >
      {badge}
    </PressableScale>
  );
}

/**
 * The forward address as a secondary pill that copies it. An address runs long, so its words keep
 * the pill's side padding and step down in size to fit whole.
 */
export function MailboxAddressPill(props: {
  readonly address: string;
  readonly onCopy: () => void;
}) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      onPress={props.onCopy}
      accessibilityRole="button"
      accessibilityLabel={props.address}
      testID="bookings-mailbox-address"
    >
      {({ pressed }) => {
        const look = buttonLook(th, 'secondary', 'large', { pressed, disabled: false });
        return (
          <View
            style={[
              styles.address,
              {
                height: th.size.button,
                borderRadius: th.radius.button,
                paddingHorizontal: th.space.pillPadH,
              },
              look.box,
            ]}
          >
            {/* One line, cut in the middle: both the crew's name and the domain stay readable. */}
            <Text variant="headline" color={look.text} numberOfLines={1} ellipsizeMode="middle">
              {props.address}
            </Text>
          </View>
        );
      }}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  address: { alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1 },
  // Clears the system grabber on iOS (it draws over the sheet's top band).
  sheet: { paddingTop: 24 },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: -16,
    marginBottom: 14,
  },
  badge: { height: 26, paddingHorizontal: 10, borderRadius: 13, justifyContent: 'center' },
});
