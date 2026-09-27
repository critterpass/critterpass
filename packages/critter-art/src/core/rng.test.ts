import { describe, expect, it } from 'vitest';

import { loadDesignDoodlesMath } from './design-math-reference';
import { createRng } from './rng';

describe('createRng', () => {
  const design = loadDesignDoodlesMath();

  it('reproduces the design generator bit-for-bit across many seeds', () => {
    for (let seed = 0; seed < 50; seed++) {
      const expected = design.rng(seed);
      const actual = createRng(seed);
      for (let call = 0; call < 20; call++) {
        expect(actual()).toBe(expected());
      }
    }
  });

  it('reproduces the design generator for the seeds used across the app plus edge values', () => {
    const seeds = [7, 12, 41, 42, 43, 44, 45, 46, 205, 381, 391, 1_000_003, 2.5, -3, 0];
    for (const seed of seeds) {
      const expected = design.rng(seed);
      const actual = createRng(seed);
      for (let call = 0; call < 10; call++) {
        expect(actual()).toBe(expected());
      }
    }
  });
});
