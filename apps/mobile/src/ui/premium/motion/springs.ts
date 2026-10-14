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

/**
 * In-screen reflow (chips wrapping, rows inserting or leaving) on the Smooth spring. Under Reduce
 * Motion nothing slides: rows take their new place at once and only their entering and exiting
 * fade.
 */
export function layoutTransition(reduced: boolean) {
  if (reduced) return LinearTransition.duration(0);
  const { stiffness, damping, mass } = premium.spring.smooth;
  return LinearTransition.springify().stiffness(stiffness).damping(damping).mass(mass);
}

/**
 * The Reduce Motion fade for a view mounting. It always runs: the app has already chosen reduced
 * motion, and a layout animation left to the phone's setting finishes at once, which on Android now
 * and then leaves the view at opacity 0.
 */
export function reducedFadeIn() {
  return FadeIn.duration(REDUCED_FADE_MS).reduceMotion(ReduceMotion.Never);
}

export function reducedFadeOut() {
  return FadeOut.duration(REDUCED_FADE_MS).reduceMotion(ReduceMotion.Never);
}

/** A row or card entering: rises on Smooth; under Reduce Motion, only fades. */
export function enterTransition(reduced: boolean) {
  if (reduced) return reducedFadeIn();
  const { stiffness, damping, mass } = premium.spring.smooth;
  return FadeIn.springify()
    .stiffness(stiffness)
    .damping(damping)
    .mass(mass)
    .reduceMotion(ReduceMotion.Never);
}

export function exitTransition(reduced: boolean) {
  if (reduced) return reducedFadeOut();
  const { stiffness, damping, mass } = premium.spring.smooth;
  return FadeOut.springify()
    .stiffness(stiffness)
    .damping(damping)
    .mass(mass)
    .reduceMotion(ReduceMotion.Never);
}
