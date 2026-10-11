/**
 * A sheet a page opens over itself (not a route): the page dims, a sheet-glass panel inset 8 with
 * the sheet corner rises from the bottom with its grabber, a title and optional line, the content,
 * and a footer that stays in view under it. Tapping the dimmed page or the system back closes it.
 * `tall` holds it near the top (the calendar sheets); otherwise it fits its content. It rides up
 * over the keyboard. A route already presented see-through over its page (`inRoute`) draws the
 * same sheet without opening a modal of its own.
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface, Text, usePremiumTheme } from '@/ui/premium';
import { useKeyboardFrame } from '@/ui/premium/shell';
import { useShellExtras } from '@/ui/premium/shell/shell-theme';

const TALL_TOP = 72;

export interface OverlaySheetProps {
  readonly title: string;
  readonly line?: string | undefined;
  /** Said by the dimmed page's button that closes the sheet. */
  readonly closeLabel: string;
  readonly onDismiss: () => void;
  /** Something beside the title (a sticker). */
  readonly aside?: ReactNode;
  readonly footer?: ReactNode;
  readonly tall?: boolean;
  /** Off for content that takes drags itself (a calendar painted with a finger). */
  readonly scroll?: boolean;
  /** The sheet is a see-through route's whole screen: no modal of its own. */
  readonly inRoute?: boolean;
  readonly children: ReactNode;
  readonly testID?: string;
}

export function OverlaySheet(props: OverlaySheetProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { scrim } = useShellExtras();
  const keyboard = useKeyboardFrame();
  const lift = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.get() }));
  const body = (
    <View style={{ gap: theme.space.gap12, paddingBottom: theme.space.gap12 }}>
      {props.children}
    </View>
  );
  const sheet = (
    <Animated.View style={[{ flex: 1, justifyContent: 'flex-end' }, lift]}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]}
        onPress={props.onDismiss}
        accessibilityRole="button"
        accessibilityLabel={props.closeLabel}
      />
      <Animated.View
        entering={props.inRoute === true ? FadeInDown : undefined}
        style={props.tall === true ? { flex: 1 } : { flexShrink: 1, maxHeight: '92%' }}
      >
        <GlassSurface
          kind="sheet"
          testID={props.testID}
          style={{
            marginHorizontal: theme.space.gap8,
            marginBottom: Math.max(insets.bottom, theme.space.gap8),
            ...(props.tall === true ? { marginTop: insets.top + TALL_TOP - 54, flex: 1 } : {}),
            flexShrink: 1,
            borderRadius: theme.radius.sheet,
            paddingHorizontal: 18,
            paddingTop: theme.space.gap8,
            paddingBottom: theme.space.gap16,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 5,
              borderRadius: 3,
              backgroundColor: theme.color.fieldBorder,
              marginBottom: 14,
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.gap12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="title" accessibilityRole="header">
                {props.title}
              </Text>
              {props.line === undefined ? null : (
                <Text variant="caption" tone="muted">
                  {props.line}
                </Text>
              )}
            </View>
            {props.aside ?? null}
          </View>
          <View
            style={{ flexShrink: 1, marginTop: 14, ...(props.tall === true ? { flex: 1 } : {}) }}
          >
            {props.scroll === false ? (
              body
            ) : (
              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {body}
              </ScrollView>
            )}
          </View>
          {props.footer === undefined ? null : (
            <View style={{ gap: theme.space.gap6, paddingTop: theme.space.gap8 }}>
              {props.footer}
            </View>
          )}
        </GlassSurface>
      </Animated.View>
    </Animated.View>
  );
  if (props.inRoute === true) return sheet;
  return (
    <Modal transparent visible animationType="slide" onRequestClose={props.onDismiss}>
      {sheet}
    </Modal>
  );
}
