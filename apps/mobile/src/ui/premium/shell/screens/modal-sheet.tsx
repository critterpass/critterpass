import type { ReactNode } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ToastHost, usePremiumTheme } from '../..';
import { FooterStack } from './footer-stack';

export interface ModalSheetProps {
  /** Swiping it down (iOS), system back (Android): the sheet's "not now". */
  readonly onDismiss: () => void;
  /** The content, top to bottom. */
  readonly children: ReactNode;
  /** The buttons at the foot. */
  readonly footer?: ReactNode;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/**
 * A sheet the app raises by itself rather than a route (the permission primer a feature asks for,
 * the visit consent at a calm moment): the native page sheet on iOS, which swipes down to dismiss,
 * and a page that rises on Android, which system back dismisses. Content scrolls under the foot.
 */
export function ModalSheet({
  onDismiss,
  children,
  footer,
  accessibilityLabel,
  testID,
}: ModalSheetProps) {
  const t = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === 'ios';
  return (
    <Modal
      visible
      animationType="slide"
      {...(ios ? { presentationStyle: 'pageSheet' as const } : { statusBarTranslucent: true })}
      onRequestClose={onDismiss}
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: t.material.sheet.fill,
            paddingTop: ios ? t.space.gap16 : insets.top + t.space.gap16,
            paddingBottom: insets.bottom + t.space.gap16,
          },
        ]}
        accessibilityViewIsModal
        {...(accessibilityLabel === undefined ? {} : { accessibilityLabel })}
        {...(testID === undefined ? {} : { testID })}
      >
        <ToastHost bottomOffset={0}>
          {ios ? <View style={[styles.grabber, { backgroundColor: t.color.placeholder }]} /> : null}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.content, { paddingHorizontal: t.space.gutter }]}
          >
            {children}
          </ScrollView>
          {footer === undefined ? null : (
            <FooterStack style={[styles.footer, { paddingHorizontal: t.space.gutter }]}>
              {footer}
            </FooterStack>
          )}
        </ToastHost>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 12 },
  scroll: { flex: 1 },
  content: { gap: 14, alignItems: 'center', paddingTop: 24, paddingBottom: 16 },
  footer: { gap: 8 },
});
