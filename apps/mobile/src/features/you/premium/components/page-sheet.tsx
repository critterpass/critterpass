/**
 * A native sheet a page opens over itself without a route (a field on the edit page): on iOS the
 * system page sheet (swipe down to dismiss, the page behind steps back), on Android the full-height
 * slide-up. Inside, the sheet screen's grammar: Cancel left, a centred title, the bold verb right,
 * and the body scrolling under them with the keyboard. Swiping down or the system back cancels;
 * with edits not yet kept the swipe holds the sheet and Cancel or back asks before they go.
 *
 * The route-less twin of the shell's `SheetScreen`, for edits that live in the page's own state.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';
import { askToDiscard } from '@/ui/premium/shell';

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
  /** Edits not yet kept: the swipe holds the sheet, and Cancel and back ask first. */
  readonly dirty?: boolean;
  readonly children: ReactNode;
  readonly testID?: string;
}

const HIT = { top: 12, bottom: 12, left: 12, right: 12 };

export function PageSheet({
  title,
  cancelLabel,
  onCancel,
  verb,
  dirty = false,
  children,
  testID,
}: PageSheetProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const ios = Platform.OS === 'ios';
  const cancel = () => {
    if (!dirty) {
      onCancel();
      return;
    }
    void askToDiscard({
      title: t({ id: 'you.premium.edit.discardTitle', message: 'Discard this change?' }),
      message: t({ id: 'you.premium.edit.discardLine', message: 'What you changed here goes.' }),
      discard: t({ id: 'you.premium.edit.discard', message: 'Discard' }),
      keep: t({ id: 'you.premium.edit.keepEditing', message: 'Keep editing' }),
    }).then((discard) => {
      if (discard) onCancel();
    });
  };
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle={ios ? 'pageSheet' : 'fullScreen'}
      allowSwipeDismissal={!dirty}
      onRequestClose={cancel}
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
        {/* The system page sheet draws no grabber over a plain modal: the sheet draws its own. */}
        {ios ? <View style={[styles.grabber, { backgroundColor: th.color.placeholder }]} /> : null}
        <View style={[styles.header, { paddingHorizontal: th.space.gutter }]}>
          <PressableScale
            onPress={cancel}
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
            // Room above the first field for its focus ring, which the scroll view would clip.
            paddingTop: th.space.gap8,
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
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8 },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cancel: { fontWeight: '400' },
  title: { flex: 1 },
  verbSpace: { minWidth: 44 },
});
