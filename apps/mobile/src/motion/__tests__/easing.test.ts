import { describe, expect, it } from '@jest/globals';

import { tokens } from '@cp/design-tokens';

import { bezierEasing, isPhysicalSpring, springConfig } from '../easing';

describe('bezierEasing', () => {
  it('clamps input at the curve boundaries', () => {
    const easing = bezierEasing(tokens.motion.easing.inOut);
    expect(easing(0)).toBe(0);
    expect(easing(1)).toBe(1);
    expect(easing(-1)).toBe(0);
    expect(easing(2)).toBe(1);
  });

  it('passes through the midpoint for a point-symmetric curve (x1+x2=1, y1+y2=1)', () => {
    // motion.easing.inOut is [.65, 0, .35, 1]: .65+.35=1 and 0+1=1, so the curve is symmetric
    // around (.5, .5) regardless of the exact bezier solver used.
    const [x1, y1, x2, y2] = tokens.motion.easing.inOut;
    expect(x1 + x2).toBeCloseTo(1);
    expect(y1 + y2).toBeCloseTo(1);
    expect(bezierEasing(tokens.motion.easing.inOut)(0.5)).toBeCloseTo(0.5, 5);
  });

  it('is monotonically non-decreasing for every non-overshoot design easing token', () => {
    // `back`, `burst` and `island` overshoot past 1 by design (docs/design-system.md §3.2: "~10%
    // overshoot", "Burst in", "Island toast") and are excluded on purpose — every other token here
    // is a plain ease curve.
    const monotonicEasings = [
      'standard',
      'enter',
      'exit',
      'inOut',
      'slam',
      'gesture',
      'press',
    ] as const;
    for (const key of monotonicEasings) {
      const easing = bezierEasing(tokens.motion.easing[key]);
      let previous = easing(0);
      for (let t = 0.05; t <= 1; t += 0.05) {
        const value = easing(t);
        expect(value).toBeGreaterThanOrEqual(previous - 1e-6);
        previous = value;
      }
    }
  });

  it('overshoots past 1 for the curves designed to (back, burst, island)', () => {
    for (const key of ['back', 'burst', 'island'] as const) {
      const easing = bezierEasing(tokens.motion.easing[key]);
      const peak = Math.max(...Array.from({ length: 21 }, (_, i) => easing(i / 20)));
      expect(peak).toBeGreaterThan(1);
    }
  });
});

describe('isPhysicalSpring / springConfig', () => {
  it('recognises the physical springs (snappy, bouncy, gentle, soft) and forwards their tunables', () => {
    for (const key of ['snappy', 'bouncy', 'gentle', 'soft'] as const) {
      const spring = tokens.motion.spring[key];
      expect(isPhysicalSpring(spring)).toBe(true);
      if (isPhysicalSpring(spring)) {
        expect(springConfig(spring)).toEqual({
          stiffness: spring.stiffness,
          damping: spring.damping,
          mass: spring.mass,
        });
      }
    }
  });

  it('rejects the easingDuration spring (sheet)', () => {
    expect(isPhysicalSpring(tokens.motion.spring.sheet)).toBe(false);
  });
});
