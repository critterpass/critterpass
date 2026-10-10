/**
 * The three premium springs as Reanimated configs (foundations-spec.md §7). Always the physical
 * form: Reanimated's `{duration, dampingRatio}` form treats duration as perceptual (1.5× real) and
 * would not match SwiftUI's response. Reduce Motion swaps every spring for a 150 ms cross-fade.
 */
import { Easing, FadeIn, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import type { WithSpringConfig, WithTimingConfig } from 'react-native-reanimated';

import { premium } from '@cp/design-tokens';
import type { PremiumSpringName } from '@cp/design-tokens';

export type { PremiumSpringName };

function config(name: PremiumSpringName): WithSpringConfig {
  const { stiffness, damping, mass } = premium.spring[name];
  // The app decides Reduce Motion itself (motion-mode aware), so the spring never second-guesses it.
  return { stiffness, damping, mass, reduceMotion: ReduceMotion.Never };
}

export const SPRINGS: Readonly<Record<PremiumSpringName, WithSpringConfig>> = {
  snappy: config('snappy'),
  smooth: config('smooth'),
  lively: config('lively'),
};

export const REDUCED_FADE_MS = premium.motion.reduceMotionFadeMs;

/** The Reduce Motion replacement for any spring: a short linear-out fade. */
export const REDUCED_FADE: WithTimingConfig = {
  duration: REDUCED_FADE_MS,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.Never,
};

/** In-screen reflow (chips wrapping, rows inserting or leaving) on the Smooth spring. */
export function layoutTransition(reduced: boolean) {
  if (reduced) return LinearTransition.duration(REDUCED_FADE_MS);
  const { stiffness, damping, mass } = premium.spring.smooth;
  return LinearTransition.springify().stiffness(stiffness).damping(damping).mass(mass);
}

/** A row or card entering: rises on Smooth; under Reduce Motion, only fades. */
export function enterTransition(reduced: boolean) {
  if (reduced) return FadeIn.duration(REDUCED_FADE_MS);
  const { stiffness, damping, mass } = premium.spring.smooth;
  return FadeIn.springify().stiffness(stiffness).damping(damping).mass(mass);
}

export function exitTransition(reduced: boolean) {
  if (reduced) return FadeOut.duration(REDUCED_FADE_MS);
  const { stiffness, damping, mass } = premium.spring.smooth;
  return FadeOut.springify().stiffness(stiffness).damping(damping).mass(mass);
}
