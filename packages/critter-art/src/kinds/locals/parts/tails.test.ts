import { describe, expect, it } from 'vitest';

import { loadDesignTailFn } from '../design-critter-reference';
import { buildBothCritterOps } from '../design-critter-fixture';
import { drawTail } from './tails';

const TAIL_TYPES = [
  'bushy', 'big', 'plume', 'pango', 'thin', 'ringthin', 'ring', 'long', 'otter', 'rat',
  'tuft', 'twin', 'curl', 'puff', 'stub', 'curlup',
] as const;

describe('drawTail', () => {
  const designTail = loadDesignTailFn();
  const colors = { f: '#dba06a', dk: '#8f5a3a', bl: '#f4d9b0' };

  it.each(TAIL_TYPES)('matches the design op sequence for tail type %s at bw=21', (type) => {
    const { ours, design } = buildBothCritterOps(drawTail, designTail, 7, '#221e19', type, colors, {}, 21);
    expect(ours).toEqual(design);
  });

  it.each(TAIL_TYPES)('matches the design op sequence for tail type %s at a wider bw', (type) => {
    const { ours, design } = buildBothCritterOps(drawTail, designTail, 41, '#221e19', type, colors, {}, 27);
    expect(ours).toEqual(design);
  });

  it('matches the design op sequence with tt/tc/mc overrides', () => {
    const overrides = { tt: '#3a3466', tc: '#ffc2d6', mc: '#54d6a4' };
    for (const type of ['bushy', 'thin', 'tuft', 'twin'] as const) {
      const { ours, design } = buildBothCritterOps(drawTail, designTail, 7, '#221e19', type, colors, overrides, 21);
      expect(ours).toEqual(design);
    }
  });

  it('renders nothing for an unknown or undefined tail type', () => {
    for (const type of [undefined, 'none', 'unknown-tail']) {
      const { ours, design } = buildBothCritterOps(drawTail, designTail, 7, '#221e19', type, colors, {}, 21);
      expect(ours).toEqual([]);
      expect(design).toEqual([]);
    }
  });
});
