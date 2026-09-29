import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import type { ComponentType } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { AccessibilityActionEvent, StyleProp, TextStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { REDUCED_IMPACT_FADE_MS, useReducedImpactMotion } from '../patterns/shared';
import { toastQueue, useToastQueue } from './queue';

/** docs/design-system.md §3.2 `standard` duration ("Navigation, sheets, reveals"): 340 ms. */
const DROP_IN_MS = 340;
/** Dynamic Island's own safe-area top inset starts around here on supported iPhones (14 Pro+). */
const DYNAMIC_ISLAND_MIN_TOP_INSET_PT = 51;
/** "swipe up to dismiss": an upward drag past this distance (or a fast flick) commits. */
const DISMISS_DISTANCE_PT = 40;
const DISMISS_VELOCITY_PT_PER_MS = 0.55;

const islandEasing = bezierEasing(tokens.motion.easing.island);

export function hasDynamicIsland(topInset: number): boolean {
  return Platform.OS === 'ios' && topInset >= DYNAMIC_ISLAND_MIN_TOP_INSET_PT;
}

/** The slice of the component library's `Text` the toast sets its copy with. */
export interface ToastTextProps {
  readonly variant: 'rowTitle' | 'bodySm' | 'buttonSm';
  readonly numberOfLines?: number;
  readonly style?: StyleProp<TextStyle>;
  readonly children: string;
}

export interface IslandToastProps {
  /**
   * The library `Text` (`@/ui`). Motion sits below the component library, so the app root hands
   * it in rather than this module importing it.
   */
  readonly Text: ComponentType<ToastTextProps>;
}

/** Accessibility action names (the labels screen readers read come from the toast and catalog). */
const OPEN_ACTION = 'open';
const DISMISS_ACTION = 'dismiss';

/**
 * Drops from the top (Dynamic Island area on supported iPhones, a banner elsewhere/Android),
 * docs/design-system.md §4.4. Mounted once near the app root — `motion-lab.tsx` mounts its own
 * copy for the dev preview.
 *
 * The alert (live region) wraps only the sticker and text: Android folds an alert into one
 * screen-reader node, and the Open and Dismiss buttons sit beside it so they stay reachable. The
 * alert also carries both as accessibility actions, so TalkBack lists them on the folded node.
 */
export function IslandToast({ Text }: IslandToastProps) {
  const toast = useToastQueue();
  const insets = useSafeAreaInsets();
  const reduced = useReducedImpactMotion();
  const island = hasDynamicIsland(insets.top);

  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (!toast) return;
    progress.value = reduced
      ? withTiming(1, { duration: REDUCED_IMPACT_FADE_MS })
      : withTiming(1, { duration: DROP_IN_MS, easing: islandEasing });
    dragY.value = 0;
    AccessibilityInfo.announceForAccessibility(
      [toast.title, toast.subtitle].filter(Boolean).join('. '),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs only when a new toast becomes current (by id).
  }, [toast?.id]);

  const gesture = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      // eslint-disable-next-line react-hooks/immutability -- a Reanimated shared value's `.value` setter, not React state (same false positive `patterns/confetti.tsx` already documents, triggered by the `useEffect` above touching the same ref).
      dragY.value = Math.min(0, event.translationY);
    })
    .onEnd((event) => {
      'worklet';
      const velocityPtPerMs = event.velocityY / 1000;
      if (-dragY.value > DISMISS_DISTANCE_PT || -velocityPtPerMs > DISMISS_VELOCITY_PT_PER_MS) {
        // eslint-disable-next-line react-hooks/immutability -- see the comment above.
        progress.value = withTiming(0, { duration: REDUCED_IMPACT_FADE_MS });
      } else {
        // eslint-disable-next-line react-hooks/immutability -- see the comment above.
        dragY.value = withTiming(0, { duration: REDUCED_IMPACT_FADE_MS });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * -80 + dragY.value },
      { scale: 0.9 + progress.value * 0.1 },
    ],
  }));

  if (!toast) return null;

  const dismissLabel = t({ id: 'motion.islandToast.dismiss', message: 'Dismiss' });
  const action = toast.action;
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === OPEN_ACTION) action?.onPress();
    if (event.nativeEvent.actionName === DISMISS_ACTION) toastQueue.dismiss();
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, island ? styles.hostIsland : styles.hostBanner]}
    >
      <GestureDetector gesture={gesture}>
        <Animated.View testID="island-toast-pill" style={[styles.pill, animatedStyle]}>
          <View
            testID="island-toast-message"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityActions={[
              ...(action ? [{ name: OPEN_ACTION, label: action.label }] : []),
              { name: DISMISS_ACTION, label: dismissLabel },
            ]}
            onAccessibilityAction={onAccessibilityAction}
            style={styles.message}
          >
            {toast.sticker}
            <View style={styles.textColumn}>
              <Text variant="rowTitle" numberOfLines={1} style={styles.onPill}>
                {toast.title}
              </Text>
              {toast.subtitle ? (
                <Text variant="bodySm" numberOfLines={1} style={styles.subtitle}>
                  {toast.subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          {action ? (
            <Pressable
              testID="island-toast-open"
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.onPress}
            >
              <Text variant="buttonSm" style={styles.onPill}>
                {action.label}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            testID="island-toast-dismiss"
            accessibilityRole="button"
            accessibilityLabel={dismissLabel}
            hitSlop={12}
            onPress={() => toastQueue.dismiss()}
          >
            <Text variant="rowTitle" style={styles.dismissGlyph}>
              ×
            </Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// Plain StyleSheet (no @cp/design-tokens colour/spacing values): a toast pill's exact treatment
// isn't specified in this phase's renders beyond the motion spec, so layout-only styling here; the
// shell/design phase can restyle via its own wrapper without touching this component's behaviour.
const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hostIsland: {
    top: 8,
  },
  hostBanner: {
    top: 0,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'black',
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  textColumn: {
    flexShrink: 1,
  },
  onPill: {
    color: 'white',
  },
  subtitle: {
    color: 'white',
    opacity: 0.8,
  },
  dismissGlyph: {
    color: 'white',
    opacity: 0.6,
    paddingHorizontal: 4,
  },
});
