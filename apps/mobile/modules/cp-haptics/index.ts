import * as Haptics from 'expo-haptics';

import { nativeCpHapticsModule } from './src/CpHapticsModule';

/**
 * Patterns this module can play natively (docs/design-system.md §4): the ones Core Haptics /
 * `VibrationEffect.Composition` can do that `expo-haptics`' discrete impacts cannot. Generated from
 * `sound.tokens.json`'s haptic column — only `sos` (a discrete "long continuous pattern") and
 * `holdRamp` (driven continuously via `ramp.*`, not `play()`) name a continuous/long pattern there.
 */
export const CP_HAPTIC_PATTERN_IDS = ['sos'] as const;
export type CpHapticPatternId = (typeof CP_HAPTIC_PATTERN_IDS)[number];

/** True when the device has a haptics engine capable of continuous ramps/long patterns. */
export function isSupported(): boolean {
  if (!nativeCpHapticsModule) return false;
  try {
    return nativeCpHapticsModule.isSupported();
  } catch {
    return false;
  }
}

/**
 * A fallback for devices/platforms without Core Haptics or a `VibrationEffect.Composition`-capable
 * Android version (docs plan step 5: "`isSupported()` fallback to `expo-haptics` impacts"): three
 * heavy impacts stand in for the long SOS pattern rather than firing nothing at all — `sos`
 * "bypasses quiet hours" precisely because it must always be noticeable.
 */
function playFallback(patternId: CpHapticPatternId): void {
  if (patternId !== 'sos') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

/** Plays a discrete native pattern (currently only `'sos'`). */
export function play(patternId: CpHapticPatternId): void {
  if (!isSupported() || !nativeCpHapticsModule) {
    playFallback(patternId);
    return;
  }
  nativeCpHapticsModule.play(patternId);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * A continuous intensity ramp (docs/design-system.md §4 `holdRamp`: "Hold ring, encounter"), driven
 * by `gestures/hold-fill.ts`'s fill progress. No-ops (rather than throwing) when unsupported — the
 * hold-fill visual/SFX feedback still plays without the extra ramp.
 */
export const ramp = {
  // `this: void` on every method: none reads `this`, and callers (e.g. `gestures/hold-fill.ts`) tear
  // these off into bare `() => ramp.start()`-style closures.
  start(this: void): void {
    if (isSupported() && nativeCpHapticsModule) nativeCpHapticsModule.rampStart();
  },
  update(this: void, intensity: number): void {
    if (isSupported() && nativeCpHapticsModule)
      nativeCpHapticsModule.rampUpdate(clamp01(intensity));
  },
  stop(this: void): void {
    if (isSupported() && nativeCpHapticsModule) nativeCpHapticsModule.rampStop();
  },
};
