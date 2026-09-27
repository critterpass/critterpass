import Constants from 'expo-constants';
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

/**
 * Slowmo and motion freeze are debug tools: available under a dev server and in every non-production
 * build variant, never in production. Keyed on the variant rather than `__DEV__` alone because the
 * `e2e-test` profile ships a release build of the `development` variant, and that is where Maestro
 * takes its motion-freeze screenshots. An unknown or missing variant counts as production.
 */
export function debugMotionControlsEnabled(isDev: boolean, appVariant: unknown): boolean {
  return isDev || appVariant === 'development' || appVariant === 'staging';
}

const debugControlsEnabled = debugMotionControlsEnabled(
  __DEV__,
  Constants.expoConfig?.extra?.appVariant,
);

/** Sets the debug slowmo multiplier. No-op in production so a shipped build can never be slowed down. */
export function setSlowmoMultiplier(multiplier: SlowmoMultiplier): void {
  if (!debugControlsEnabled) return;
  slowmoMultiplier.value = multiplier;
}

/** Toggles motion-freeze mode. No-op in production; only `motion-lab` and Maestro use it. */
export function setMotionFreeze(frozen: boolean): void {
  if (!debugControlsEnabled) return;
  motionFreeze.value = frozen;
}
