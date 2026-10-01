import { describe, expect, it } from '@jest/globals';

import { INITIAL_SHAKE_STATE, stepShake, type ShakeSample } from '../shake';

const STEP_MS = 20;
const GRAVITY = 9.81;

/** Runs `seconds` of samples through the recogniser and returns when shakes fired (ms). */
function firedTimes(seconds: number, sampleAt: (t: number) => ShakeSample): number[] {
  const fired: number[] = [];
  let state = INITIAL_SHAKE_STATE;
  for (let ms = 0; ms <= seconds * 1000; ms += STEP_MS) {
    state = stepShake(state, sampleAt(ms / 1000), ms);
    if (state.fired) fired.push(ms);
  }
  return fired;
}

const wave = (amplitude: number, hertz: number, t: number) =>
  amplitude * Math.sin(2 * Math.PI * hertz * t);

describe('stepShake', () => {
  it('fires once for a hard side-to-side shake of a phone held upright (gravity in the samples)', () => {
    const fired = firedTimes(1.5, (t) => ({ x: wave(30, 5, t), y: -GRAVITY, z: 0 }));
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBeLessThan(1000);
  });

  it('fires for the same shake when the platform has already removed gravity', () => {
    expect(firedTimes(1.5, (t) => ({ x: 0, y: wave(28, 4, t), z: 0 }))).toHaveLength(1);
  });

  it('fires again only after the cooldown when the shaking goes on', () => {
    const fired = firedTimes(6, (t) => ({ x: wave(30, 5, t), y: 0, z: -GRAVITY }));
    expect(fired.length).toBeGreaterThan(1);
    const gaps = fired.slice(1).map((at, index) => at - (fired[index] ?? 0));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(2500);
  });

  it('ignores walking with the phone in hand', () => {
    const fired = firedTimes(20, (t) => ({
      x: wave(2, 1, t),
      y: -GRAVITY + wave(5, 2, t),
      z: wave(1.5, 2, t),
    }));
    expect(fired).toEqual([]);
  });

  it('ignores putting the phone down on a table: one knock and its rebound', () => {
    const fired = firedTimes(4, (t) => {
      const knock = t >= 2 && t < 2.04 ? 30 : t >= 2.04 && t < 2.08 ? -20 : 0;
      return { x: 0, y: 0, z: -GRAVITY + knock };
    });
    expect(fired).toEqual([]);
  });

  it('ignores turning the phone over and back', () => {
    const fired = firedTimes(8, (t) => {
      const angle = Math.PI * Math.min(1, Math.abs(((t % 4) - 2) / 0.4));
      return { x: 0, y: GRAVITY * Math.sin(angle), z: -GRAVITY * Math.cos(angle) };
    });
    expect(fired).toEqual([]);
  });

  it('ignores hard knocks that are seconds apart', () => {
    const fired = firedTimes(12, (t) => {
      const beat = Math.floor(t);
      const phase = t - beat;
      const knock = phase < 0.04 ? (beat % 2 === 0 ? 30 : -30) : 0;
      return { x: knock, y: 0, z: -GRAVITY };
    });
    expect(fired).toEqual([]);
  });
});
