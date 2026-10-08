import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import type { AccessibilityActionEvent, StyleProp, TextLayoutEvent, TextStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '../easing';
import { REDUCED_IMPACT_FADE_MS, useReducedImpactMotion } from '../patterns/shared';
import { toastPlacement } from './placement';
import { toastQueue, useToastQueue } from './queue';

/** docs/design-system.md §3.2 `standard` duration ("Navigation, sheets, reveals"): 340 ms. */
const DROP_IN_MS = 340;
/** "swipe up to dismiss": an upward drag past this distance (or a fast flick) commits. */
const DISMISS_DISTANCE_PT = 40;
const DISMISS_VELOCITY_PT_PER_MS = 0.55;
/** How long the pill takes to leave once it is dismissed or timed out. */
export const LEAVE_MS = 180;

const islandEasing = bezierEasing(tokens.motion.easing.island);

/** A title on its own may run to a second line; with a subtitle under it, each keeps to one. */
export function titleLineLimit(toast: { readonly subtitle?: string | undefined }): 1 | 2 {
  return toast.subtitle ? 1 : 2;
}

/** The slice of the component library's `Text` the toast sets its copy with. */
export interface ToastTextProps {
  readonly variant: 'rowTitle' | 'bodySm' | 'buttonSm';
  readonly numberOfLines?: number;
  readonly style?: StyleProp<TextStyle>;
  readonly onTextLayout?: (event: TextLayoutEvent) => void;
  readonly children: string;
}

export interface IslandToastProps {
  /**
   * The library `Text` (`@/ui`). Motion sits below the component library, so the app root hands
   * it in rather than this module importing it.
   */
  readonly Text: ComponentType<ToastTextProps>;
  /**
   * The title as it was laid out, line by line: the app root hands in the UI QA check that reports
   * a title still cut on its lines (copy to shorten, or to split into a subtitle).
   */
  readonly onTitleLayout?: (title: string, lines: readonly { readonly text: string }[]) => void;
}

/** Accessibility action names (the labels screen readers read come from the toast and catalog). */
const OPEN_ACTION = 'open';
const DISMISS_ACTION = 'dismiss';
const ACTIVATE_ACTION = 'activate';
const ACTIVATE = [{ name: ACTIVATE_ACTION }];

/**
 * Drops in from the top, always below the safe-area inset (`toastPlacement`): out from under the
 * Dynamic Island on supported iPhones, a banner elsewhere/Android. docs/design-system.md §4.4. Mounted once near the app root — `motion-lab.tsx` mounts its own
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
export function IslandToast({ Text, onTitleLayout }: IslandToastProps) {
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
  const placement = toastPlacement(insets);
  const { travel, startScale } = placement;

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
          // Swiped away: the toast leaves the queue.
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
  // Declared on both sides, so the buttons are never cancelled by the claim on either platform.
  openTap.simultaneousWithExternalGesture(claim);
  dismissTap.simultaneousWithExternalGesture(claim);
  const pillGesture = Gesture.Simultaneous(gesture, claim);

  const animatedStyle = useAnimatedStyle(() => ({
    // A pill dragged up towards the island or status bar fades out before it gets there.
    opacity: progress.value * Math.max(0, 1 + dragY.value / DISMISS_DISTANCE_PT),
    transform: [
      { translateY: (1 - progress.value) * -travel + dragY.value },
      { scale: startScale + progress.value * (1 - startScale) },
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
      style={[styles.host, { top: placement.top, left: placement.left, right: placement.right }]}
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
              <Text
                variant="rowTitle"
                numberOfLines={titleLineLimit(toast)}
                style={styles.onPill}
                onTextLayout={(event) => onTitleLayout?.(toast.title, event.nativeEvent.lines)}
              >
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
  );
}

// An undesigned pill: the darkest ink with paper type, the way the island itself reads. Its corner
// radius is fixed, so a second title line makes the pill taller without changing its corners.
const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space['8'],
    borderRadius: tokens.radius.xl,
    // Grows downwards from its top edge, the one nearest the island.
    transformOrigin: 'top',
    paddingVertical: tokens.space['8'],
    paddingHorizontal: tokens.space['14'],
    backgroundColor: tokens.color.ink['950'],
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space['8'],
    flexShrink: 1,
  },
  textColumn: {
    flexShrink: 1,
  },
  onPill: {
    color: tokens.color.paper.bright,
  },
  subtitle: {
    color: tokens.color.ink['100'],
  },
  dismissGlyph: {
    color: tokens.color.ink['200'],
    paddingHorizontal: tokens.space['4'],
  },
});
