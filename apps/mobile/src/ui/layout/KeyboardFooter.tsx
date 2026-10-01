import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
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
 * How far an already open keyboard covers the screen from its bottom edge, as React Native last
 * saw it; 0 while the keyboard is down. Android measures the keyboard from the top of the
 * navigation bar, iOS from the bottom of the screen.
 */
function openKeyboardCover(home: number): number {
  const metrics = Keyboard.metrics();
  if (metrics === undefined || metrics === null) return 0;
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
  // the keyboard stands, or it would sit behind it until the keyboard moved again.
  const [openAtMount, setOpenAtMount] = useState(() => openKeyboardCover(home));
  useEffect(() => {
    if (openAtMount === 0) return undefined;
    // A keyboard that closes before Reanimated has reported anything lets the footer down too.
    const closed = Keyboard.addListener('keyboardDidHide', () => setOpenAtMount(0));
    return () => closed.remove();
  }, [openAtMount]);
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
