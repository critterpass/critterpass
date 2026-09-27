import { makeMutable, type SharedValue } from 'react-native-reanimated';

export type SlowmoMultiplier = 1 | 2 | 4;

/**
 * Debug-only playback rate for `useSharedClock` (docs/design-system.md §3.1: "a `slowmo` multiplier
 * (1x/2x/4x) is available in debug builds"). A module-level `SharedValue` (rather than one created
 * per component with `useSharedValue`) so every mounted loop reads the same clock rate.
 */
export const slowmoMultiplier: SharedValue<SlowmoMultiplier> = makeMutable<SlowmoMultiplier>(1);

/**
 * Debug-only "motion freeze": every loop renders its resting frame and the shared clock stops
 * advancing. Used by Maestro's motion-freeze screenshot mode (docs/code-standards.md §17).
 */
export const motionFreeze: SharedValue<boolean> = makeMutable(false);

/** Sets the debug slowmo multiplier. No-op outside `__DEV__` so a release build can never be slowed down. */
export function setSlowmoMultiplier(multiplier: SlowmoMultiplier): void {
  if (!__DEV__) return;
  slowmoMultiplier.value = multiplier;
}

/** Toggles motion-freeze mode. No-op outside `__DEV__`; only `motion-lab` and Maestro use it. */
export function setMotionFreeze(frozen: boolean): void {
  if (!__DEV__) return;
  motionFreeze.value = frozen;
}
