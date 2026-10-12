/**
 * A sheet that rises over a premium screen (the MVP vote, a reaction, sharing, the postcard's note): the scrim
 * closes it, a grabber and ✕ sit on top, the content scrolls when it is tall, and the keyboard
 * pushes it up. Undesigned in the premium set, built from the kit's sheet radius and ground.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton, Text, makePremiumStyles } from '@/ui/premium';

// eslint-disable-next-line critterpass/no-literal-style, lingui/no-unlocalized-strings -- the sheet scrim the premium tokens do not carry yet
const SHEET_SCRIM = 'rgba(20,22,40,.3)';

const useStyles = makePremiumStyles((th) => ({
  sheet: {
    marginHorizontal: 8,
    marginBottom: 8,
    maxHeight: '86%',
    paddingTop: 10,
    paddingHorizontal: 20,
    borderRadius: th.radius.sheet,
    backgroundColor: th.color.ground,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: th.color.outlineEmpty,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, marginBottom: 12 },
}));

export function PremiumSheet({
  title,
  onClose,
  children,
  scroll = true,
  testID,
}: {
  /** False for a sheet whose content takes drags itself (a signature pad). */
  readonly scroll?: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: SHEET_SCRIM }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'recap.premium.sheet.close', message: 'Close' })}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
        pointerEvents="box-none"
      >
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          testID={testID}
        >
          <View style={styles.grabber} />
          <View style={styles.head}>
            <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </Text>
            <GlassIconButton
              icon="close"
              label={t({ id: 'recap.premium.sheet.close', message: 'Close' })}
              onPress={onClose}
            />
          </View>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
              {children}
            </ScrollView>
          ) : (
            <View style={{ gap: 10 }}>{children}</View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
