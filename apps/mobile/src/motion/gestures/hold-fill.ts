import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

// `apps/mobile/modules/cp-haptics` is this phase's own native module (plan §"Architecture &
// contracts"); `tools/lint/boundaries.js` (owned by an earlier phase) does not yet classify
// `apps/mobile/modules/*` as an importable layer from `mobile-motion` — same class of pre-existing
// gap `apps/mobile/src/lib/i18n/set-locale.ts` already documents for `@cp/i18n`.
// eslint-disable-next-line boundaries/dependencies -- see the comment above
import { ramp } from '../../../modules/cp-haptics';
import { impact } from '../feedback';
import type { GestureHookResult } from './shared';

/** docs/design-system.md §3.4 `holdFill`: "touch fill 1500 (legendary 2400), drain 450". */
export const HOLD_FILL_MS = 1500;
export const HOLD_FILL_LEGENDARY_MS = 2400;
export const HOLD_DRAIN_MS = 450;

export interface UseHoldFillOptions {
  /** @default HOLD_FILL_MS */
  readonly fillMs?: number;
  readonly onComplete: () => void;
  /** An externally-driven fill (dwell-based, e.g. staying inside a geofence) instead of touch-and-hold. */
  readonly externalProgress?: SharedValue<number>;
  readonly disabled?: boolean;
  readonly accessibilityLabel: string;
}

export interface HoldFillAnimatedStyle {
  readonly transform: { scale: number }[];
}

/** A hold-to-fill ring (docs/design-system.md §3.4), touch- or dwell-driven, ramping `cp-haptics`. */
export function useHoldFill({
  fillMs = HOLD_FILL_MS,
  onComplete,
  externalProgress,
  disabled = false,
  accessibilityLabel,
}: UseHoldFillOptions): GestureHookResult & { readonly progress: SharedValue<number> } {
  const touchProgress = useSharedValue(0);
  const progress = externalProgress ?? touchProgress;
  // "critter scale 1→1.3" over the fill.
  const critterScale = useDerivedValue(() => 1 + progress.value * 0.3);

  const fireComplete = () => onComplete();
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a sound-cue id, never rendered copy.
  const fireCompleteImpact = () => impact('thud.soft');
  const startRamp = () => ramp.start();
  const updateRamp = (value: number) => ramp.update(value);
  const stopRamp = () => ramp.stop();

  const gesture = Gesture.LongPress()
    .enabled(!disabled && !externalProgress)
    .minDuration(0)
    .onStart(() => {
      'worklet';
      scheduleOnRN(startRamp);
      touchProgress.value = withTiming(1, { duration: fillMs }, (finished) => {
        if (finished) {
          scheduleOnRN(fireComplete);
          scheduleOnRN(fireCompleteImpact);
          scheduleOnRN(stopRamp);
        }
      });
    })
    .onFinalize((_event, success) => {
      'worklet';
      if (!success) {
        cancelAnimation(touchProgress);
        touchProgress.value = withTiming(0, { duration: HOLD_DRAIN_MS });
        scheduleOnRN(stopRamp);
      }
    });

  // Samples the fill each frame to feed `cp-haptics`' continuous ramp — the native side throttles
  // to 30 Hz itself (T6), so calling more often here is harmless, just extra no-op hops.
  useFrameCallback(() => {
    'worklet';
    if (progress.value > 0 && progress.value < 1) scheduleOnRN(updateRamp, progress.value);
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: critterScale.value }],
  }));

  return {
    gesture,
    animatedStyle,
    progress,
    accessibilityActions: [{ name: 'activate', label: accessibilityLabel }],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === 'activate') onComplete();
    },
  };
}
