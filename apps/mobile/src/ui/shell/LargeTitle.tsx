import type { ReactNode } from 'react';
import { useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { Text } from '../text/Text';
import { BackButton, canGoBack } from './BackButton';
import { makeStyles, MIN_TOUCH_TARGET } from '../theme';

/** Scroll distance over which the large title hands over to the compact header title. */
export const LARGE_TITLE_COLLAPSE_PT = tokens.type.h1.fontSize ?? tokens.space['32'];
const LIFT_PT = tokens.space['8'];

/** `collapse` 0 (expanded) → 1 (collapsed) from a scroll view's offset. */
export function useLargeTitleCollapse(): {
  readonly collapse: SharedValue<number>;
  readonly collapsed: boolean;
  readonly onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
} {
  const collapse = useSharedValue(0);
  const [collapsed, setCollapsed] = useState(false);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.min(
      1,
      Math.max(0, event.nativeEvent.contentOffset.y / LARGE_TITLE_COLLAPSE_PT),
    );
    collapse.value = next;
    const isCollapsed = next >= 1;
    if (isCollapsed !== collapsed) setCollapsed(isCollapsed);
  };
  return { collapse, collapsed, onScroll };
}

const useStyles = makeStyles((t) => ({
  bar: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: t.size.gutter,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // The slots keep their content's width (a back button, pills); the compact title takes what is
  // left and truncates, so the actions are never squeezed.
  side: { minWidth: MIN_TOUCH_TARGET, alignItems: 'flex-start' },
  end: { minWidth: MIN_TOUCH_TARGET, alignItems: 'flex-end' },
  compact: { flex: 1, minWidth: 0, paddingHorizontal: t.space['8'] },
  compactText: { textAlign: 'center' },
  large: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['8'] },
}));

export interface LargeTitleProps {
  readonly title: string;
  readonly collapse?: SharedValue<number> | undefined;
  /** Whether the compact title is showing (for screen readers, which ignore opacity). */
  readonly collapsed?: boolean | undefined;
  /** Leading slot; defaults to a back button whenever there is a screen to go back to. */
  readonly start?: ReactNode;
  readonly end?: ReactNode;
}

/**
 * Screen header: a condensed h1 that collapses into a small centred title as content scrolls
 * (3n-6), with a start slot (a back button on any pushed screen unless one is given) and an end slot
 * (pills). The compact title truncates between the slots, so they never overlap.
 */
export function LargeTitle({ title, collapse, collapsed = false, start, end }: LargeTitleProps) {
  const styles = useStyles();
  const reduced = useReducedImpactMotion();
  const fallback = useSharedValue(0);
  const progress = collapse ?? fallback;

  const compactStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const largeStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateY: reduced ? 0 : -LIFT_PT * progress.value }],
  }));

  return (
    <View>
      <View style={styles.bar}>
        <View style={styles.side}>{start ?? (canGoBack() ? <BackButton /> : null)}</View>
        <Animated.View
          style={[styles.compact, compactStyle]}
          accessibilityElementsHidden={!collapsed}
          importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
        >
          <Text
            variant="title"
            numberOfLines={1}
            style={styles.compactText}
            accessibilityRole={collapsed ? 'header' : undefined}
          >
            {title}
          </Text>
        </Animated.View>
        <View style={styles.end}>{end}</View>
      </View>
      <Animated.View
        style={[styles.large, largeStyle]}
        accessibilityElementsHidden={collapsed}
        importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
      >
        {/* A long title fits and wraps (h1's auto-fit, up to three lines) rather than running
            under the end slot, which sits in the bar above it. */}
        <Text variant="h1" accessibilityRole="header">
          {title}
        </Text>
      </Animated.View>
    </View>
  );
}
