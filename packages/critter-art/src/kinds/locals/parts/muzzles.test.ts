import { describe, expect, it } from 'vitest';

import { loadDesignMuzTable } from '../design-critter-reference';
import type { DesignCritterFn } from '../design-critter-reference';
import { buildBothCritterOps, designTableDispatcher } from '../design-critter-fixture';
import { drawMuzzle } from './muzzles';

const MUZ_TYPES = [
  'plain', 'dog', 'cat', 'long', 'snout', 'big', 'flat', 'capy', 'otter',
  'rat', 'bunny', 'teeth', 'snub', 'monkey', 'longnose',
] as const;

describe('drawMuzzle', () => {
  const designMuzzle = designTableDispatcher(loadDesignMuzTable());
  const colors = { f: '#dba06a', dk: '#8f5a3a', bl: '#f4d9b0' };

  it.each(MUZ_TYPES)('matches the design op sequence for muzzle type %s', (type) => {
    const spec = { snc: '#ffb8c8', tusks: 1 as const, fcol: '#a8d4ff', ring: 1 as const };
    const { ours, design } = buildBothCritterOps(drawMuzzle, designMuzzle, 7, '#221e19', type, 31, colors, spec);
    expect(ours).toEqual(design);
  });

  it('falls back to plain for an unknown or undefined muzzle type', () => {
    // Unlike drawMask/drawPattern, the design's own call site falls back to `plain`
    // (`MUZ[s.muz || 'plain'] || MUZ.plain`) — designTableDispatcher only does a plain lookup, so
    // this replicates that specific fallback expression instead of the generic dispatcher.
    const table = loadDesignMuzTable();
    const designMuzzleWithFallback: DesignCritterFn = (sink, type, ...rest) => {
      const key = typeof type === 'string' ? type : 'plain';
      const fn = table[key] ?? table['plain'];
      fn?.(sink, ...rest);
    };
    for (const type of [undefined, 'unknown-muzzle']) {
      const { ours, design } = buildBothCritterOps(drawMuzzle, designMuzzleWithFallback, 7, '#221e19', type, 31, colors, {});
      expect(ours).toEqual(design);
      expect(ours.length).toBeGreaterThan(0);
    }
  });
});
