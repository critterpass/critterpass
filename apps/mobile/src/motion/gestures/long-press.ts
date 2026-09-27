import { Gesture } from 'react-native-gesture-handler';
import { useAnimatedStyle } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { GestureHookResult } from './shared';

/** docs/design-system.md §3.3: "long-press 320 ms". */
export const LONG_PRESS_DURATION_MS = 320;

export interface UseLongPressOptions {
  readonly onLongPress: () => void;
  readonly disabled?: boolean;
  /** design-system.md §5: e.g. "hold ring → custom action (delete → confirm dialog)". */
  readonly accessibilityLabel: string;
}

export function useLongPress({
  onLongPress,
  disabled = false,
  accessibilityLabel,
}: UseLongPressOptions): GestureHookResult {
  const fireOnLongPress = () => onLongPress();

  const gesture = Gesture.LongPress()
    .enabled(!disabled)
    .minDuration(LONG_PRESS_DURATION_MS)
    .onStart(() => {
      'worklet';
      scheduleOnRN(fireOnLongPress);
    });

  // A bare long-press has no visual of its own in the design (combine with `usePress` or
  // `useHoldFill` for one) — a real (empty) handle keeps the return shape consistent with every
  // other gesture hook.
  const animatedStyle = useAnimatedStyle(() => ({}));

  return {
    gesture,
    animatedStyle,
    accessibilityActions: [{ name: 'longpress', label: accessibilityLabel }],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === 'longpress') onLongPress();
    },
  };
}
