/**
 * A native sheet a page opens over itself without a route (a field on the edit page): on iOS the
 * system page sheet (swipe down to dismiss, the page behind steps back), on Android the full-height
 * slide-up. Inside, the sheet screen's grammar (`SheetHeader`): the glass ✕ left, a centred title,
 * the verb's ink pill right, and the body scrolling under them with the keyboard. Swiping down or the system back cancels;
 * with edits not yet kept the swipe holds the sheet and Cancel or back asks before they go.
 *
 * The route-less twin of the shell's `SheetScreen`, for edits that live in the page's own state.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePremiumTheme } from '@/ui/premium';
import { askToDiscard, SheetHeader } from '@/ui/premium/shell';

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
        <SheetHeader
          leadingLabel={cancelLabel}
          onLeading={cancel}
          title={title}
          verb={
            verb === undefined
              ? undefined
              : {
                  label: verb.label,
                  onPress: verb.onPress,
                  disabled: verb.disabled === true,
                  ...(verb.testID === undefined ? {} : { testID: verb.testID }),
                }
          }
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a test id, never copy.
          {...(testID === undefined ? {} : { leadingTestID: `${testID}-cancel` })}
        />
        <ScrollView
          style={styles.root}
          contentContainerStyle={{
            paddingHorizontal: th.space.gutter,
            // Room for the first field's focus ring under the header.
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
});
