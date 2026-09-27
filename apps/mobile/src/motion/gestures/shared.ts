import type { AccessibilityActionEvent, AccessibilityActionInfo } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';

/**
 * Every gesture hook in this kit returns this shape (T9 step 3): a `GestureType` for
 * `<GestureDetector gesture={...}>`, the animated style it drives (spread onto an `Animated.View`'s
 * `style` prop — `useAnimatedStyle`'s opaque handle, never a plain style object; that handle type
 * isn't exported publicly, so this is left as `object` rather than fighting it — each hook's own
 * `Use*AnimatedStyle` interface documents the shape once unwrapped), and an a11y escape hatch
 * (docs/design-system.md §5 "Gesture alternatives") so every gesture-only interaction has a
 * non-gesture action a screen reader can invoke.
 */
export interface GestureHookResult {
  readonly gesture: GestureType;
  readonly animatedStyle: object;
  readonly accessibilityActions: readonly AccessibilityActionInfo[];
  readonly onAccessibilityAction: (event: AccessibilityActionEvent) => void;
}

/** design-system.md §5: "informational motion instant" — reduced/off motion drops springs to instant snaps. */
export function reducedGestureDurationMs(fullMs: number, reduced: boolean): number {
  return reduced ? 0 : fullMs;
}
