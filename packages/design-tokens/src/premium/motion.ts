/**
 * Premium motion (foundations-spec.md §7): three springs and nothing else animates. Each spring is
 * kept in both forms: physical (stiffness/damping, mass 1, what Reanimated's `withSpring` and
 * Compose's `spring()` take) and perceptual (response/damping fraction, what SwiftUI takes; bounce =
 * 1 − damping fraction). With mass 1: stiffness = (2π / response)², damping = 4π·ζ / response.
 */

export interface PremiumSpring {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: 1;
  /** SwiftUI `response` in seconds. */
  readonly response: number;
  /** SwiftUI `dampingFraction` (ζ). */
  readonly dampingFraction: number;
  /** SwiftUI `bounce` (1 − ζ). */
  readonly bounce: number;
}

export type PremiumSpringName = 'snappy' | 'smooth' | 'lively';

export const premiumSprings: Readonly<Record<PremiumSpringName, PremiumSpring>> = {
  /** Tabs, toggles, chips, the tab lens: done before the finger lifts. */
  snappy: {
    stiffness: 438.6,
    damping: 36.02,
    mass: 1,
    response: 0.3,
    dampingFraction: 0.86,
    bounce: 0.14,
  },
  /** Sheets, zooms, the page stepping back: no overshoot. */
  smooth: {
    stiffness: 195,
    damping: 27.93,
    mass: 1,
    response: 0.45,
    dampingFraction: 1,
    bounce: 0,
  },
  /** Stamps, stickers, the island, confetti: one wobble, then still. */
  lively: {
    stiffness: 157.9,
    damping: 17.09,
    mass: 1,
    response: 0.5,
    dampingFraction: 0.68,
    bounce: 0.32,
  },
};

/** Signature motion keyframes (foundations-spec.md §7, phones 1.07 and 1.09). */
export const premiumMotion = {
  /** Reduce Motion: every move becomes this cross-fade. */
  reduceMotionFadeMs: 150,
  /** One turn of the loading spinner (a progress loop, not a move, so it keeps turning). */
  spinnerTurnMs: 900,
  /** One sweep of the skeleton shimmer. */
  shimmerSweepMs: 1400,
  /** The thinking critter's bob (design: `fx="bob" dur="1400"`). */
  bobMs: 1400,
  bobLift: 6,
  /** Toasts rise in from this far below. */
  toastRise: 24,
  /** How long a toast stays before it leaves on its own. */
  toastHoldMs: 4000,
  /** Line box of a rolling digit, as a multiple of its size (SF's natural line height). */
  rollLineHeight: 1.2,
  /** Press feedback on the primary pill. */
  pressScale: 0.97,
  /** Content entering under a settled frame rises this far. */
  riseDistance: 24,
  sheetContentRise: 16,
  stamp: {
    fromY: -120,
    fromScale: 2.2,
    fromRotate: -30,
    impactScaleX: 0.9,
    impactScaleY: 0.84,
    restRotate: -12,
    joltDown: 3,
    joltUp: 2,
    joltRotate: 0.4,
    rippleFrom: 0.6,
    rippleTo: 1.7,
    confettiPieces: 44,
    /** How far confetti flies out, and how far it falls by the end. */
    confettiReach: 170,
    confettiFall: 140,
    rippleStroke: 2,
    resultRise: 40,
  },
  swipe: {
    nudgeX: 40,
    nudgeRotate: 4,
    stampFromScale: 1.4,
    stampRotate: -16,
    flyX: 460,
    flyY: 40,
    flyRotate: 20,
    nextFromScale: 0.93,
    nextFromY: 18,
    /** A fling past this share of the card width commits the vote. */
    commitRatio: 0.32,
    /** A fling faster than this (pt/s) commits whatever the distance. */
    flingVelocity: 800,
  },
} as const;
