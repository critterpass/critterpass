import { describe, expect, it } from 'vitest';

import { loadDesignPatTable } from '../design-critter-reference';
import { buildBothCritterOps, designTableDispatcher } from '../design-critter-fixture';
import { drawPattern } from './patterns';

const PAT_TYPES = [
  'tabby',
  'stripes',
  'spots',
  'dalmatian',
  'rosettes',
  'stars',
  'moon',
  'ridge',
  'bristle',
] as const;

describe('drawPattern', () => {
  const designPattern = designTableDispatcher(loadDesignPatTable());
  const colors = { f: '#dba06a', dk: '#8f5a3a', bl: '#f4d9b0' };

  it.each(PAT_TYPES)('matches the design op sequence for pattern type %s', (type) => {
    const { ours, design } = buildBothCritterOps(
      drawPattern,
      designPattern,
      7,
      '#221e19',
      type,
      colors,
      31,
      21,
    );
    expect(ours).toEqual(design);
  });

  it.each(PAT_TYPES)(
    'matches the design op sequence for pattern type %s at a different body width',
    (type) => {
      const { ours, design } = buildBothCritterOps(
        drawPattern,
        designPattern,
        41,
        '#221e19',
        type,
        colors,
        24,
        19,
      );
      expect(ours).toEqual(design);
    },
  );

  it('renders nothing for an unknown or undefined pattern type', () => {
    for (const type of [undefined, 'unknown-pattern']) {
      const { ours, design } = buildBothCritterOps(
        drawPattern,
        designPattern,
        7,
        '#221e19',
        type,
        colors,
        31,
        21,
      );
      expect(ours).toEqual([]);
      expect(design).toEqual([]);
    }
  });
});
