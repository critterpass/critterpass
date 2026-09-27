// The project's Reanimated mock collapses every animation to its end value, which hides mistakes in
// how animations are composed. This suite swaps in Reanimated's real animation builders so the loop
// runs frame by frame exactly as the UI thread steps it.
jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual<Record<string, unknown>>('../../test-support/reanimated-mock');
  const real = jest.requireActual<Record<string, unknown>>('react-native-reanimated/src/animation');
  return {
    ...mock,
    withDelay: real.withDelay,
    withRepeat: real.withRepeat,
    withSequence: real.withSequence,
    withTiming: real.withTiming,
  };
});

import { describe, expect, it, jest } from '@jest/globals';

import { sheenCycle } from '../sheen';

interface SteppedAnimation {
  current: number;
  onStart: (animation: SteppedAnimation, value: number, now: number, previous: null) => void;
  onFrame: (animation: SteppedAnimation, now: number) => boolean;
}

// On the React Native runtime Reanimated hands back a factory that the UI thread calls to build the
// animation object; elsewhere it is the object itself.
function build(definition: unknown): SteppedAnimation {
  return (
    typeof definition === 'function' ? (definition as () => unknown)() : definition
  ) as SteppedAnimation;
}

const FRAME_MS = 16;

describe('sheenCycle', () => {
  it('sweeps 0 to 1, jumps back to 0 and keeps looping every 3600 ms', () => {
    const animation = build(sheenCycle());
    animation.onStart(animation, 0, 0, null);

    const samples = new Map<number, number>();
    for (let now = FRAME_MS; now <= 3 * 3600; now += FRAME_MS) {
      expect(animation.onFrame(animation, now)).toBe(false);
      samples.set(now, animation.current);
    }

    const values = [...samples.values()];
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    // Mid-sweep, holding at the end of the sweep, and back at the start in the following cycles.
    expect(samples.get(512)).toBeGreaterThan(0);
    expect(samples.get(512)).toBeLessThan(1);
    expect(samples.get(2000)).toBe(1);
    expect(values.filter((value) => value === 0).length).toBeGreaterThan(0);
    expect(samples.get(3600 + 512)).toBeGreaterThan(0);
    expect(samples.get(2 * 3600 + 2000)).toBe(1);
  });
});
