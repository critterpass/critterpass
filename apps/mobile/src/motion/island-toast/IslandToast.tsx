import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { AccessibilityInfo, Platform, StatusBar, StyleSheet, View } from 'react-native';
import type { AccessibilityActionEvent, StyleProp, TextStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
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
/** How long the pill takes to leave once it is dismissed or timed out. */
export const LEAVE_MS = 180;
/**
 * Where the toast drops to below the status bar on a phone without an island: clear of the row of
 * header controls every screen draws there (back, ALL DAYS, SHARE), so it never sits on one.
 */
export const HEADER_CLEARANCE_PT = 56;

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
const ACTIVATE_ACTION = 'activate';
const ACTIVATE = [{ name: ACTIVATE_ACTION }];

/**
 * Drops from the top (Dynamic Island area on supported iPhones, a banner elsewhere/Android),
 * docs/design-system.md §4.4. Mounted once near the app root — `motion-lab.tsx` mounts its own
 * copy for the dev preview.
 *
 * The alert (live region) wraps only the sticker and text: Android folds an alert into one
 * screen-reader node, and the Open and Dismiss buttons sit beside it so they stay reachable. The
 * alert also carries both as accessibility actions, so TalkBack lists them on the folded node.
 *
 * The pill takes every touch that lands on it, for its whole life, including while it leaves: a
 * gesture on the pill activates on touch-down, which cancels whatever lies under it (a header
 * button handled by the gesture system would otherwise fire as well, and cancel the toast's own).
 * Its buttons are gestures too, run alongside that one.
 */
export function IslandToast({ Text }: IslandToastProps) {
  const current = useToastQueue();
  // The last toast stays on screen, still taking its touches, while it leaves.
  const [leaving, setLeaving] = useState<typeof current>(null);
  const [previous, setPrevious] = useState(current);
  if (previous !== current) {
    setPrevious(current);
    setLeaving(current === null ? previous : null);
  }
  const toast = current ?? leaving;
  const insets = useSafeAreaInsets();
  const reduced = useReducedImpactMotion();
  const island = hasDynamicIsland(insets.top);

  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  const leftId = leaving?.id ?? null;
  useEffect(() => {
    if (leftId === null) return;
    const done = () => setLeaving(null);
    progress.value = withTiming(0, { duration: LEAVE_MS }, (finished) => {
      if (finished) scheduleOnRN(done);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs only when a toast starts leaving.
  }, [leftId]);

  useEffect(() => {
    if (!current) return;
    // eslint-disable-next-line react-hooks/immutability -- a Reanimated shared value's `.value` setter, not React state (see the gesture below).
    progress.value = reduced
      ? withTiming(1, { duration: REDUCED_IMPACT_FADE_MS })
      : withTiming(1, { duration: DROP_IN_MS, easing: islandEasing });
    dragY.value = 0;
    AccessibilityInfo.announceForAccessibility(
      [current.title, current.subtitle].filter(Boolean).join('. '),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-runs only when a new toast becomes current (by id).
  }, [current?.id]);

  const dismissCurrent = () => toastQueue.dismiss();
  const runAction = () => {
    toast?.action?.onPress();
  };

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
        progress.value = withTiming(0, { duration: REDUCED_IMPACT_FADE_MS }, (finished) => {
          // Swiped away: the toast leaves the queue, which also brings the status bar back.
          if (finished) scheduleOnRN(dismissCurrent);
        });
      } else {
        // eslint-disable-next-line react-hooks/immutability -- see the comment above.
        dragY.value = withTiming(0, { duration: REDUCED_IMPACT_FADE_MS });
      }
    });

  // Claims the touch the moment it lands on the pill, so nothing under the pill sees it.
  const openTap = Gesture.Tap()
    .onEnd(() => {
      'worklet';
      scheduleOnRN(runAction);
    })
    .withTestId('island-toast-open-tap');
  const dismissTap = Gesture.Tap()
    .hitSlop(12)
    .onEnd(() => {
      'worklet';
      scheduleOnRN(dismissCurrent);
    })
    .withTestId('island-toast-dismiss-tap');
  const claim = Gesture.Manual()
    .onTouchesDown((_event, manager) => {
      'worklet';
      manager.activate();
    })
    .onTouchesUp((_event, manager) => {
      'worklet';
      manager.end();
    })
    .simultaneousWithExternalGesture(openTap, dismissTap)
    .withTestId('island-toast-claim');
  const pillGesture = Gesture.Simultaneous(gesture, claim);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * -80 + dragY.value },
      { scale: 0.9 + progress.value * 0.1 },
    ],
  }));

  // On a Dynamic Island phone the pill grows out of the island, where the clock and signal sit:
  // the status bar fades out while a toast shows and fades back when it leaves. It stays mounted
  // so the return animates too. Elsewhere the toast drops in below the status bar.
  const statusBar = island ? (
    <StatusBar hidden={current !== null} animated showHideTransition="fade" />
  ) : null;

  if (!toast) return <>{statusBar}</>;

  const dismissLabel = t({ id: 'motion.islandToast.dismiss', message: 'Dismiss' });
  const action = toast.action;
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === OPEN_ACTION) action?.onPress();
    if (event.nativeEvent.actionName === DISMISS_ACTION) toastQueue.dismiss();
  };

  return (
    <>
      {statusBar}
      <View
        pointerEvents="box-none"
        style={[
          styles.host,
          island ? styles.hostIsland : { top: insets.top + HEADER_CLEARANCE_PT },
        ]}
      >
        <GestureDetector gesture={pillGesture}>
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
              <GestureDetector gesture={openTap}>
                <View
                  testID="island-toast-open"
                  collapsable={false}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  accessibilityActions={ACTIVATE}
                  onAccessibilityAction={(event) => {
                    if (event.nativeEvent.actionName === ACTIVATE_ACTION) action.onPress();
                  }}
                >
                  <Text variant="buttonSm" style={styles.onPill}>
                    {action.label}
                  </Text>
                </View>
              </GestureDetector>
            ) : null}
            <GestureDetector gesture={dismissTap}>
              <View
                testID="island-toast-dismiss"
                collapsable={false}
                accessible
                accessibilityRole="button"
                accessibilityLabel={dismissLabel}
                accessibilityActions={ACTIVATE}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === ACTIVATE_ACTION) toastQueue.dismiss();
                }}
              >
                <Text variant="rowTitle" style={styles.dismissGlyph}>
                  ×
                </Text>
              </View>
            </GestureDetector>
          </Animated.View>
        </GestureDetector>
      </View>
    </>
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
