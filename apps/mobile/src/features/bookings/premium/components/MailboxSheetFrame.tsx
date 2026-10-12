/**
 * The mailbox sheet's frame (7.05): the native page sheet on iOS; on Android a sheet over a scrim
 * that keeps clear of the status bar. And the "With Pass+" badge under its actions.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale, Text, usePremiumTheme, type PremiumTheme } from '@/ui/premium';

/** The sheet frame: the native page sheet on iOS, a sheet over a scrim on Android. */
export function MailboxSheetFrame(props: {
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === 'ios';
  const sheet = (
    <View
      style={[
        styles.sheet,
        { backgroundColor: th.material.sheet.fill },
        ios
          ? styles.fill
          : {
              marginTop: insets.top + th.space.gap16,
              borderTopLeftRadius: th.radius.sheet,
              borderTopRightRadius: th.radius.sheet,
              boxShadow: th.materialShadow.sheet,
            },
      ]}
    >
      <View style={[styles.grabber, { backgroundColor: th.color.outlineEmpty }]} />
      {props.children}
    </View>
  );
  return (
    <Modal
      visible
      transparent={!ios}
      statusBarTranslucent
      animationType="slide"
      presentationStyle={ios ? 'pageSheet' : 'overFullScreen'}
      onRequestClose={props.onClose}
      testID="bookings-mailbox"
    >
      {ios ? (
        sheet
      ) : (
        <View style={[styles.fill, { backgroundColor: th.color.scrim }]}>
          <Pressable style={styles.fill} onPress={props.onClose} accessible={false} />
          {sheet}
        </View>
      )}
    </Modal>
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: { paddingTop: 12, flexShrink: 1 },
  grabber: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  badge: { height: 26, paddingHorizontal: 10, borderRadius: 13, justifyContent: 'center' },
});
