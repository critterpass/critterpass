import type { WithSpringConfig } from 'react-native-reanimated';

import type { Tokens } from '@cp/design-tokens';

// `@cp/design-tokens` exports the resolved `Tokens` tree but not its leaf `$type` names, so these
// are derived by indexed access rather than duplicating the shape by hand.
export type CubicBezier = Tokens['motion']['easing']['inOut'];
export type SpringValue = Tokens['motion']['spring'][keyof Tokens['motion']['spring']];

export type EasingFn = (t: number) => number;

// Standard cubic-bezier easing (Newton-Raphson root-finding with a bisection fallback for slopes
// too flat to converge) — the same numerical method browsers use for CSS's `cubic-bezier()` and
// what most JS easing libraries implement. Kept local (rather than Reanimated's own `Easing.bezier`)
// so this file has no runtime dependency on `react-native-reanimated` at all: every function here is
// a `'worklet'`, so it still runs correctly on the UI thread inside a real `withTiming` call.
function bezierDerivativeCoefficients(p1: number, p2: number): readonly [number, number, number] {
  'worklet';
  const c = 3 * p1;
  const b = 3 * p2 - 6 * p1;
  const a = 1 - 3 * p2 + 3 * p1;
  return [a, b, c];
}

function bezierValueAt(t: number, p1: number, p2: number): number {
  'worklet';
  const [a, b, c] = bezierDerivativeCoefficients(p1, p2);
  return ((a * t + b) * t + c) * t;
}

function bezierSlopeAt(t: number, p1: number, p2: number): number {
  'worklet';
  const [a, b, c] = bezierDerivativeCoefficients(p1, p2);
  return 3 * a * t * t + 2 * b * t + c;
}

/** Finds the curve parameter `t` whose x-coordinate equals `x`. */
function solveCurveParameter(x: number, x1: number, x2: number): number {
  'worklet';
  let t = x;
  for (let i = 0; i < 8; i++) {
    const slope = bezierSlopeAt(t, x1, x2);
    if (Math.abs(slope) < 1e-6) break;
    t -= (bezierValueAt(t, x1, x2) - x) / slope;
  }
  if (t >= 0 && t <= 1) return t;

  let lower = 0;
  let upper = 1;
  let candidate = x;
  for (let i = 0; i < 20 && upper - lower > 1e-7; i++) {
    candidate = (lower + upper) / 2;
    const value = bezierValueAt(candidate, x1, x2) - x;
    if (Math.abs(value) < 1e-7) break;
    if (value > 0) upper = candidate;
    else lower = candidate;
  }
  return candidate;
}

/** Converts a `motion.easing.*` cubic-bezier token into a worklet-safe easing function (0 to 1 in, 0 to 1 out). */
export function bezierEasing(bezier: CubicBezier): EasingFn {
  const [x1, y1, x2, y2] = bezier;
  return function easing(t: number): number {
    'worklet';
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return bezierValueAt(solveCurveParameter(t, x1, x2), y1, y2);
  };
}

/** A `motion.spring.*` token whose `kind` maps directly onto Reanimated's `withSpring`. */
export type PhysicalSpring = Extract<SpringValue, { kind: 'physical' }>;

export function isPhysicalSpring(spring: SpringValue): spring is PhysicalSpring {
  return spring.kind === 'physical';
}

/**
 * Converts a physical `cpSpring` token into a Reanimated `withSpring` config. `overshootPercent` is
 * a design annotation describing the resulting curve, not a tunable Reanimated accepts, so it is
 * intentionally not forwarded. The other spring kind (`easingDuration`, used only by the `sheet`
 * token) has no `withSpring` equivalent — use `withTiming` with `bezierEasing(spring.easing)` and
 * `spring.durationMs` instead.
 */
export function springConfig(spring: PhysicalSpring): WithSpringConfig {
  return { stiffness: spring.stiffness, damping: spring.damping, mass: spring.mass };
}
