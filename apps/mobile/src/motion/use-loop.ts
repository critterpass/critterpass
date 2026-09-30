import { useIsFocused } from 'expo-router';
import { useAnimatedStyle } from 'react-native-reanimated';

import { useSharedClock } from './clock';
import { useIdleLoopRunning } from './idle-pause';
import { useMotionMode } from './motion-mode';
import {
  LOOP_PRESETS,
  restingLoopTransform,
  sampleLoopPreset,
  type LoopPresetId,
  type LoopTransform,
} from './presets';

export interface UseLoopOptions {
  /** Phase offset (0 to 1) so paired instances run out of phase (`ping`'s "pairs offset ½"). */
  readonly offset?: number;
  /** External visibility control (e.g. list virtualization marking an off-screen row inactive). */
  readonly active?: boolean;
}

function transformToStyle(t: LoopTransform) {
  'worklet';
  return {
    opacity: t.o,
    transform: [
      { translateX: t.tx },
      { translateY: t.ty },
      { rotate: `${t.r}deg` },
      { scaleX: t.sx },
      { scaleY: t.sy },
    ],
  };
}

/**
 * Animated style for one of the 10 idle loop presets (docs/design-system.md §3.1), sampled from the
 * shared clock. Renders the resting frame, with the clock paused, when the screen is unfocused, the
 * caller marks it inactive, the effective motion mode is not `'full'` (design-system.md §5: "idle
 * loops static"), or the e2e build's play budget is spent (`useIdleLoopRunning`).
 */
export function useLoop(id: LoopPresetId, options: UseLoopOptions = {}) {
  const isFocused = useIsFocused();
  const [motionMode] = useMotionMode();
  const active = useIdleLoopRunning((options.active ?? true) && isFocused && motionMode === 'full');
  const clock = useSharedClock(active);
  const offset = options.offset ?? 0;
  const def = LOOP_PRESETS[id];

  return useAnimatedStyle(() => {
    if (!active) {
      return transformToStyle(restingLoopTransform(id));
    }
    return transformToStyle(sampleLoopPreset(def, clock.value / def.durationMs + offset));
  });
}
