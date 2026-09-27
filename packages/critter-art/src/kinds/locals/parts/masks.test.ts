import { describe, expect, it } from 'vitest';

import { loadDesignMaskTable } from '../design-critter-reference';
import { buildBothCritterOps, designTableDispatcher } from '../design-critter-fixture';
import { drawMask } from './masks';

const MASK_TYPES = [
  'raccoon',
  'panda',
  'loris',
  'sloth',
  'face',
  'akita',
  'stb',
  'beard',
  'fringe',
] as const;

describe('drawMask', () => {
  const designMask = designTableDispatcher(loadDesignMaskTable());
  const colors = { f: '#dba06a', dk: '#8f5a3a', bl: '#f4d9b0' };

  it.each(MASK_TYPES)('matches the design op sequence for mask type %s', (type) => {
    const { ours, design } = buildBothCritterOps(
      drawMask,
      designMask,
      7,
      '#221e19',
      type,
      31,
      colors,
      { fcol: '#ffb8c8' },
    );
    expect(ours).toEqual(design);
  });

  it('renders nothing for an unknown or undefined mask type', () => {
    for (const type of [undefined, 'unknown-mask']) {
      const { ours, design } = buildBothCritterOps(
        drawMask,
        designMask,
        7,
        '#221e19',
        type,
        31,
        colors,
        {},
      );
      expect(ours).toEqual([]);
      expect(design).toEqual([]);
    }
  });
});
