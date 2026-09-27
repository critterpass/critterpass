import { createContext, createElement, useContext, type ReactNode } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';

const JOLT_TOTAL_MS = 280;
const joltEasing = bezierEasing(tokens.motion.easing.inOut);

interface ScreenJoltContextValue {
  readonly jolt: SharedValue<number>;
  /** Screen-root jolt (docs/design-system.md §3.4 `stamp`: "screen ty 0->5->-2->0, 280"). */
  readonly triggerScreenJolt: () => void;
}

const ScreenJoltContext = createContext<ScreenJoltContextValue | null>(null);

/**
 * Mounted once near the app root. Exposes the single screen-jolt shared value every impact pattern
 * triggers into (`useScreenJolt`) and that the screen root reads (`useScreenJoltStyle`), so multiple
 * simultaneous impacts jolt the same screen once rather than stacking.
 */
export function ScreenJoltProvider({ children }: { readonly children: ReactNode }) {
  const jolt = useSharedValue(0);
  // Not memoized: `jolt` (a shared value) is itself a stable reference across renders, so a plain
  // object here costs one small allocation per render, not an extra re-render for context consumers
  // that only read `jolt`/call `triggerScreenJolt` from an effect or a gesture handler.
  const triggerScreenJolt = () => {
    jolt.value = withSequence(
      withTiming(5, { duration: JOLT_TOTAL_MS * 0.4, easing: joltEasing }),
      withTiming(-2, { duration: JOLT_TOTAL_MS * 0.35, easing: joltEasing }),
      withTiming(0, { duration: JOLT_TOTAL_MS * 0.25, easing: joltEasing }),
    );
  };
  return createElement(
    ScreenJoltContext.Provider,
    { value: { jolt, triggerScreenJolt } },
    children,
  );
}

export function useScreenJolt(): ScreenJoltContextValue {
  const context = useContext(ScreenJoltContext);
  if (!context) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing throw, never rendered.
    throw new Error('useScreenJolt: no ScreenJoltProvider found above this component');
  }
  return context;
}

/** Applied to the screen root; renders the jolt `triggerScreenJolt` starts, or nothing if idle. */
export function useScreenJoltStyle() {
  const { jolt } = useScreenJolt();
  return useAnimatedStyle(() => ({ transform: [{ translateY: jolt.value }] }));
}
