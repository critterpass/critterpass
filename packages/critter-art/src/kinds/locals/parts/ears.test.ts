import { describe, expect, it } from 'vitest';

import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps } from '../design-critter-fixture';
import { drawEars } from './ears';

const EAR_TYPES = [
  'cat',
  'fox',
  'fen',
  'bat',
  'big',
  'pig',
  'tuft',
  'long',
  'sheep',
  'deer',
  'side2',
  'horse',
  'llama',
  'round',
  'mouse',
  'tiny',
  'koala',
  'side',
  'flop',
] as const;

describe('drawEars', () => {
  const { X } = loadDesignCritterKit();
  const designEars = asDesignFn(X.ears, 'X.ears');
  const colors = { f: '#dba06a', dk: '#8f5a3a', bl: '#f4d9b0' };
  const head = { x: 50, y: 31, k: 1 };

  it.each(EAR_TYPES)(
    'matches the design op sequence for ear type %s (default colours, every phase)',
    (type) => {
      for (const phase of [0, 1, 2] as const) {
        const spec = {};
        const { ours, design } = buildBothCritterOps(
          drawEars,
          designEars,
          7,
          '#221e19',
          type,
          head,
          colors,
          spec,
          phase,
        );
        expect(ours).toEqual(design);
      }
    },
  );

  it('matches the design op sequence with ec/ic overrides', () => {
    const spec = { ec: '#3a3466', ic: '#ffc2d6' };
    for (const phase of [0, 1] as const) {
      const { ours, design } = buildBothCritterOps(
        drawEars,
        designEars,
        7,
        '#221e19',
        'flop',
        head,
        colors,
        spec,
        phase,
      );
      expect(ours).toEqual(design);
    }
  });

  it('renders nothing for an unknown or undefined ear type', () => {
    for (const type of [undefined, 'unknown-ear']) {
      const { ours, design } = buildBothCritterOps(
        drawEars,
        designEars,
        7,
        '#221e19',
        type,
        head,
        colors,
        {},
        1,
      );
      expect(ours).toEqual([]);
      expect(design).toEqual([]);
    }
  });
});
