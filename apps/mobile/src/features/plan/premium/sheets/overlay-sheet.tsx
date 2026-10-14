/**
 * A sheet a page opens over itself (not a route): the page dims, a sheet-glass panel inset 8 with
 * the sheet corner rises from the bottom on the Smooth spring with its grabber, a title and
 * optional line, the content, and a footer that stays in view under it. Dragging the grabber band
 * down, tapping the dimmed page or the system back closes it; one holding edits (`dirty`) asks
 * before it drops them.
 * `tall` holds it near the top (the calendar sheets, a stop's details); otherwise it fits its
 * content. The panel is the shell's sheet material, so the page never reads through it. Content
 * that runs on under the title or the footer fades into the sheet there instead of being cut. It
 * rides up over the keyboard. A route already presented see-through over its page (`inRoute`) draws the
 * same sheet without opening a modal of its own.
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, usePremiumTheme } from '@/ui/premium';
import {
  SCROLL_EDGE_FADE,
  ScrollEdgeFade,
  useKeyboardFrame,
  useScrollEdges,
  sheetMaterialStyle,
  type DiscardPrompt,
} from '@/ui/premium/shell';
import { useCoverPageSheet } from '@/ui/premium/shell/screens/page-sheet-cover';
import { useShellExtras } from '@/ui/premium/shell/shell-theme';

import { useSheetDrag } from './use-sheet-drag';

const TALL_TOP = 72;

export interface OverlaySheetProps {
  readonly title: string;
  readonly line?: string | undefined;
  /** Said by the dimmed page's button that closes the sheet. */
  readonly closeLabel: string;
  /** Runs once the sheet has played its exit: the page unmounts it. */
  readonly onDismiss: () => void;
  /** Edits not yet kept: the drag, the dimmed page and the system back ask `discard` first. */
  readonly dirty?: boolean;
  readonly discard?: DiscardPrompt;
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
  // One card at a time: the page's own sheet steps down while this one is up.
  useCoverPageSheet();
  const lift = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.get() }));
  const drag = useSheetDrag({
    onDismiss: props.onDismiss,
    dirty: props.dirty,
    discard: props.discard,
  });
  const edges = useScrollEdges();
  const tall = props.tall === true;
  // The fades blend into the panel's own colour.
  const ground = theme.material.sheet.fill;
  const panelStyle = {
    marginHorizontal: theme.space.gap8,
    marginBottom: Math.max(insets.bottom, theme.space.gap8),
    ...(tall ? { marginTop: insets.top + TALL_TOP - 54, flex: 1 } : {}),
    flexShrink: 1,
    borderRadius: theme.radius.sheet,
    paddingHorizontal: 18,
    paddingTop: theme.space.gap8,
    paddingBottom: theme.space.gap16,
  };
  const body = (
    <View style={{ gap: theme.space.gap12, paddingBottom: theme.space.gap12 }}>
      {props.children}
    </View>
  );
  const sheet = (
    <Animated.View style={[{ flex: 1, justifyContent: 'flex-end' }, lift]}>
      <Animated.View style={[StyleSheet.absoluteFill, drag.scrimStyle]}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: scrim }]}
          onPress={drag.requestClose}
          accessibilityRole="button"
          accessibilityLabel={props.closeLabel}
        />
      </Animated.View>
      <Animated.View
        style={[
          props.tall === true ? { flex: 1 } : { flexShrink: 1, maxHeight: '92%' },
          drag.panelStyle,
        ]}
      >
        <SheetGround testID={props.testID} style={panelStyle}>
          <GestureDetector gesture={drag.pan}>
            <View>
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
              <View
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.space.gap12 }}
              >
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
            </View>
          </GestureDetector>
          <View style={{ flexShrink: 1, marginTop: 14, ...(tall ? { flex: 1 } : {}) }}>
            {props.scroll === false ? (
              body
            ) : (
              <>
                <ScrollView
                  bounces={false}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  {...edges.scrollProps}
                >
                  {body}
                </ScrollView>
                <ScrollEdgeFade
                  edge="top"
                  height={SCROLL_EDGE_FADE}
                  color={ground}
                  visible={edges.top}
                />
                <ScrollEdgeFade
                  edge="bottom"
                  height={SCROLL_EDGE_FADE}
                  color={ground}
                  visible={edges.bottom}
                />
              </>
            )}
          </View>
          {props.footer === undefined ? null : (
            <View style={{ gap: theme.space.gap6, paddingTop: theme.space.gap8 }}>
              {props.footer}
            </View>
          )}
        </SheetGround>
      </Animated.View>
    </Animated.View>
  );
  if (props.inRoute === true) return sheet;
  return (
    <Modal transparent visible animationType="none" onRequestClose={drag.requestClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>{sheet}</GestureHandlerRootView>
    </Modal>
  );
}

/**
 * The sheet's panel on the shell's sheet material (`sheetMaterialStyle`), as every sheet route
 * draws it, so a form never shows the page through it; there is no system glass under an overlay.
 */
function SheetGround(props: {
  readonly style: ViewStyle;
  readonly testID: string | undefined;
  readonly children: ReactNode;
}) {
  const theme = usePremiumTheme();
  return (
    <View
      testID={props.testID}
      style={[{ boxShadow: theme.materialShadow.sheet }, sheetMaterialStyle(theme), props.style]}
    >
      {props.children}
    </View>
  );
}
