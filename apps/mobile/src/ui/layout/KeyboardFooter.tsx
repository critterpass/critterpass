import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useContext } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { TAB_BAR_CLEARANCE } from '../shell/tab-bar-metrics';
import { FooterFade } from '../surface/FooterFade';
import { useSurfaceBackground } from '../surface/Scaffold';
import { makeStyles, useTheme } from '../theme';

/** How far the keyboard rises past the home indicator before the top edge is fully drawn. */
const EDGE_FADE_PT = 32;

export { FOOTER_FADE_PT } from '../surface/FooterFade';

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
  const gap = theme.space['8'];

  const lift = useAnimatedStyle(() => ({
    // The keyboard's height counts from the bottom of the screen, home indicator included; it
    // covers the tab bar when it is up.
    paddingBottom: Math.max(floor, keyboard.height.value) + gap,
  }));
  const edge = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, (keyboard.height.value - floor) / EDGE_FADE_PT)),
  }));

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
