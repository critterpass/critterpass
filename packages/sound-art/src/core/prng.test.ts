import { describe, expect, it } from 'vitest';

import { createRng, rngInt, rngRange, seedFromString } from './prng';

describe('prng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('cue:thud.heavy');
    const b = createRng('cue:thud.heavy');
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('differs for different seeds', () => {
    const a = createRng('cue:thud.heavy');
    const b = createRng('cue:thud.soft');
    expect(a()).not.toBeCloseTo(b(), 5);
  });

  it('produces values within [0, 1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('rngRange stays within bounds', () => {
    const rng = createRng('range');
    for (let i = 0; i < 200; i += 1) {
      const v = rngRange(rng, -3, 3);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(3);
    }
  });

  it('rngInt is inclusive of both bounds over many draws', () => {
    const rng = createRng('int');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(rngInt(rng, 1, 3));
    expect(seen).toEqual(new Set([1, 2, 3]));
  });

  it('seedFromString is stable', () => {
    expect(seedFromString('hello')).toBe(seedFromString('hello'));
    expect(seedFromString('hello')).not.toBe(seedFromString('world'));
  });
});
