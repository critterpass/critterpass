import { NavigationContext } from 'expo-router/react-navigation';
import { useIsRouteFocused } from 'expo-router/build/react-navigation/core/useIsFocused';
import { useContext, useEffect, useSyncExternalStore } from 'react';
import type { ContextType } from 'react';
import type { ViewProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '@/motion/easing';

import { PresentedSurfaceContext } from './presenter';

/**
 * On the scrim's own curve and done within the first beat of the rise: the bar is gone as the
 * panel reaches it, which reads as the sheet covering it.
 */
export const TAB_BAR_COVER_MS = tokens.motion.duration.instant;
const standard = bezierEasing(tokens.motion.easing.standard);

let covering = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changeBy(delta: number): void {
  covering = Math.max(0, covering + delta);
  for (const listener of listeners) listener();
}

const isCovered = () => covering > 0;

type Navigation = NonNullable<ContextType<typeof NavigationContext>>;

/** True for a screen that sits in a tab navigator, directly or through the stacks a tab holds. */
function insideTabs(navigation: Navigation | undefined): boolean {
  for (let node = navigation; node !== undefined; node = node.getParent()) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- navigator type, never rendered
    if (node.getState().type === 'tab') return true;
  }
  return false;
}

/**
 * A sheet or rise that a tab screen renders inside itself fills that screen, but the tab bar and
 * the guide button are drawn after every tab screen, so they would sit on top of its scrim and its
 * last row. While such a sheet is up on the focused screen it covers the bar: the bar steps aside
 * (`BelowSheets`). Sheets on `(modal)` routes and outside the tabs are above the bar already.
 *
 * It follows the sheet being mounted on a focused screen, not a dismiss callback, so the bar is
 * back however the sheet goes (✕, scrim, drag, Android back, its screen leaving or erroring).
 */
export function useTabBarCover(): void {
  const navigation = useContext(NavigationContext);
  const nested = useContext(PresentedSurfaceContext);
  const focused = useIsRouteFocused(undefined);
  const covers = !nested && focused && insideTabs(navigation);
  useEffect(() => {
    if (!covers) return undefined;
    changeBy(1);
    return () => changeBy(-1);
  }, [covers]);
}

/** Whether a sheet or rise inside a tab screen is up right now. */
export function useTabBarCovered(): boolean {
  return useSyncExternalStore(subscribe, isCovered, isCovered);
}

/**
 * Root of what a tab-hosted sheet covers (the tab bar with its guide button): while one is up it
 * fades out, takes no touches and leaves the screen reader's order, so focus stays in the sheet.
 */
export function BelowSheets({ style, children, ...props }: ViewProps) {
  const covered = useTabBarCovered();
  const opacity = useSharedValue(covered ? 0 : 1);
  useEffect(() => {
    opacity.value = withTiming(covered ? 0 : 1, { duration: TAB_BAR_COVER_MS, easing: standard });
  }, [covered, opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      {...props}
      pointerEvents={covered ? 'none' : 'box-none'}
      accessibilityElementsHidden={covered}
      importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
      style={[style, fade]}
    >
      {children}
    </Animated.View>
  );
}

export function resetTabBarCoverForTests(): void {
  covering = 0;
  for (const listener of listeners) listener();
}
