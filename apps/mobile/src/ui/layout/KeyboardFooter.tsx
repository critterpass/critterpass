import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Keyboard, Platform, StyleSheet, TextInput, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { TAB_BAR_CLEARANCE } from '../shell/tab-bar-metrics';
import { FooterFade } from '../surface/FooterFade';
import { useSurfaceBackground } from '../surface/Scaffold';
import { makeStyles, useTheme } from '../theme';

/** How far the keyboard rises past the home indicator before the top edge is fully drawn. */
const EDGE_FADE_PT = 32;

/** Reanimated's keyboard state before its first report (`KeyboardState.UNKNOWN`). */
const KEYBOARD_UNREPORTED = 0;

export { FOOTER_FADE_PT } from '../surface/FooterFade';

/**
 * How far an open keyboard covers the screen from its bottom edge, or 0 unless the keyboard is
 * really up right now. Android measures the keyboard from the top of the navigation bar, iOS from
 * the bottom of the screen.
 *
 * React Native's last keyboard frame is not proof on its own: on Android it outlives a keyboard
 * that went away with the screen that had it (the field unmounted while it was typing), and stays
 * until the next keyboard shows. A keyboard that is up always has a text field in focus, and a
 * field that unmounts gives its focus up, so the frame only counts while a field holds focus.
 */
function openKeyboardCover(home: number): number {
  if (!Keyboard.isVisible()) return 0;
  if (TextInput.State.currentlyFocusedInput() === null) return 0;
  const metrics = Keyboard.metrics();
  if (metrics === undefined || metrics === null || metrics.height <= 0) return 0;
  return metrics.height + (Platform.OS === 'android' ? home : 0);
}

/** The keyboard's cover a footer stands on: where it stood at mount until Reanimated reports. */
function keyboardCover(state: number, height: number, openAtMount: number): number {
  'worklet';
  return state === KEYBOARD_UNREPORTED ? Math.max(openAtMount, height) : height;
}

export interface KeyboardFooterProps {
  /** The footer's actions: a primary button, a composer, a button and an inline link. */
  readonly children: ReactNode;
  /** Horizontal inset. `gutter` matches screen content; `none` for a full-width composer. */
  readonly inset?: 'gutter' | 'none';
  /** Layout of the actions themselves (e.g. `alignItems: 'center'` for a button over a link). */
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  root: { paddingTop: th.space['12'] },
  content: { gap: th.space['8'] },
  gutter: { paddingHorizontal: th.size.gutter },
  edge: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    height: StyleSheet.hairlineWidth,
  },
}));

/**
 * The bottom of a screen with text entry: its actions sit above the home indicator while the
 * keyboard is down and ride on top of it, frame by frame, while it is up. It keeps the screen's own
 * background (the nearest `Scaffold`); content scrolling under it fades out over a short gradient
 * above its top edge, and a hairline along that edge fades in as the keyboard rises so the lifted
 * footer reads as attached to it.
 *
 * Place it as the last child of a `Scaffold` whose `edges` leave out `bottom`: the footer pads the
 * bottom inset itself, and the content above it (a flex: 1 scroll view) shrinks to make room.
 * Inside a tab (a screen the floating tab bar draws over) it also clears the bar and its FAB.
 */
export function KeyboardFooter({ children, inset = 'gutter', style, testID }: KeyboardFooterProps) {
  const styles = useStyles();
  const theme = useTheme();
  // Outside a safe-area provider (a gallery fixture under test) there is no inset to clear.
  const home = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  // Only a tab navigator's scenes get a tab bar height; stacks over the tabs have none.
  const inTab = useContext(BottomTabBarHeightContext) !== undefined;
  const floor = home + (inTab ? TAB_BAR_CLEARANCE : 0);
  const background = useSurfaceBackground() ?? theme.semantic.bg.base;
  const keyboard = useAnimatedKeyboard();
  // Reanimated reports the keyboard from its next move only. A footer that mounts while the
  // keyboard is already up (a button that appears once a typed code is found) starts from where
  // the keyboard stands, or it would sit behind it until the keyboard moved again. A keyboard that
  // is not up gives no start: the footer would float over an empty band until a field was tapped.
  const [openAtMount, setOpenAtMount] = useState(() => openKeyboardCover(home));
  useEffect(() => {
    if (openAtMount === 0) return undefined;
    const letDown = () => setOpenAtMount(0);
    // A keyboard that closes before Reanimated has reported anything lets the footer down too:
    // one that went between the first render and now, and one that goes from here on.
    if (openKeyboardCover(home) === 0) letDown();
    const closed = Keyboard.addListener('keyboardDidHide', letDown);
    return () => closed.remove();
  }, [openAtMount, home]);
  const gap = theme.space['8'];

  const lift = useAnimatedStyle(() => {
    const cover = keyboardCover(keyboard.state.value, keyboard.height.value, openAtMount);
    // The keyboard's height counts from the bottom of the screen, home indicator included; it
    // covers the tab bar when it is up.
    return { paddingBottom: Math.max(floor, cover) + gap };
  });
  const edge = useAnimatedStyle(() => {
    const cover = keyboardCover(keyboard.state.value, keyboard.height.value, openAtMount);
    return { opacity: Math.min(1, Math.max(0, (cover - floor) / EDGE_FADE_PT)) };
  });

  return (
    <>
      <FooterFade color={background} testID={testID ? `${testID}-fade` : undefined} />
      <Animated.View
        testID={testID}
        style={[
          styles.root,
          inset === 'gutter' ? styles.gutter : null,
          { backgroundColor: background },
          lift,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          testID={testID ? `${testID}-edge` : undefined}
          style={[styles.edge, { backgroundColor: theme.semantic.border.decorative }, edge]}
        />
        <View style={[styles.content, style]}>{children}</View>
      </Animated.View>
    </>
  );
}
