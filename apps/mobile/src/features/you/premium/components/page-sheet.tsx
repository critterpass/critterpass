/**
 * A native sheet a page opens over itself without a route (a field on the edit page): on iOS the
 * system page sheet (swipe down to dismiss, the page behind steps back), on Android the full-height
 * slide-up. Inside, the sheet screen's grammar: Cancel left, a centred title, the bold verb right,
 * and the body scrolling under them with the keyboard. Swiping down or the system back cancels.
 *
 * The route-less twin of the shell's `SheetScreen`, for edits that live in the page's own state.
 */
import type { ReactNode } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';

export interface PageSheetProps {
  readonly title: string;
  readonly cancelLabel: string;
  readonly onCancel: () => void;
  readonly verb?: {
    readonly label: string;
    readonly onPress: () => void;
    readonly disabled?: boolean;
    readonly testID?: string;
  };
  readonly children: ReactNode;
  readonly testID?: string;
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

export function PageSheet({
  title,
  cancelLabel,
  onCancel,
  verb,
  children,
  testID,
}: PageSheetProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === 'ios';
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle={ios ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onCancel}
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: th.material.sheet.fill,
            paddingTop: ios ? 0 : insets.top,
          },
        ]}
        testID={testID}
      >
        <View style={[styles.header, { paddingHorizontal: th.space.gutter }]}>
          <PressableScale
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            hitSlop={HIT}
            testID={testID === undefined ? undefined : `${testID}-cancel`}
          >
            <Text variant="button" style={styles.cancel}>
              {cancelLabel}
            </Text>
          </PressableScale>
          <View style={styles.title}>
            <Text variant="button" accessibilityRole="header" numberOfLines={1} align="center">
              {title}
            </Text>
          </View>
          {verb === undefined ? (
            <View style={styles.verbSpace} />
          ) : (
            <PressableScale
              onPress={verb.onPress}
              disabled={verb.disabled === true}
              accessibilityRole="button"
              accessibilityLabel={verb.label}
              accessibilityState={{ disabled: verb.disabled === true }}
              hitSlop={HIT}
              {...(verb.testID === undefined ? {} : { testID: verb.testID })}
            >
              <Text variant="button" tone={verb.disabled === true ? 'placeholder' : 'ink'}>
                {verb.label}
              </Text>
            </PressableScale>
          )}
        </View>
        <ScrollView
          style={styles.root}
          contentContainerStyle={{
            paddingHorizontal: th.space.gutter,
            paddingBottom: th.space.gap16 + insets.bottom,
            gap: th.space.gap12,
          }}
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode={ios ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cancel: { fontWeight: '400' },
  title: { flex: 1 },
  verbSpace: { minWidth: 44 },
});
