import { describe, expect, it } from 'vitest';

import { createRng } from './prng';
import { renderPluck } from './karplus-strong';

describe('karplus-strong', () => {
  it('is deterministic for the same seed', () => {
    const a = renderPluck(0.5, 220, createRng('pluck'));
    const b = renderPluck(0.5, 220, createRng('pluck'));
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('decays over time (later energy is lower than early energy)', () => {
    const buf = renderPluck(1, 220, createRng('decay'), { decay: 0.995 });
    const energy = (from: number, to: number): number => {
      let sum = 0;
      for (let i = from; i < to; i += 1) sum += Math.pow(buf[i] ?? 0, 2);
      return sum;
    };
    const early = energy(0, 4800);
    const late = energy(buf.length - 4800, buf.length);
    expect(late).toBeLessThan(early);
  });

  it('produces finite samples with no NaN', () => {
    const buf = renderPluck(0.3, 440, createRng('finite'));
    expect(buf.every((v) => Number.isFinite(v))).toBe(true);
  });
});
