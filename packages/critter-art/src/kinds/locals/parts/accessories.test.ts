import { describe, expect, it } from 'vitest';

import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps } from '../design-critter-fixture';
import { ACC, drawAccessory } from './accessories';

const ACCESSORY_NAMES = [
  'beret', 'crown', 'nonla', 'boater', 'sailor', 'bollen', 'fez', 'laurel', 'flowers', 'hood',
  'shades', 'orange', 'edelweiss', 'rose', 'marigold', 'scarf', 'tartan', 'redscarf', 'collar',
  'knot', 'bell', 'barrel', 'amber', 'tassel', 'bridle', 'pizza', 'dice', 'berries', 'bamboo',
  'acorn', 'gumleaf', 'tulip', 'balloon',
] as const;

describe('ACC table', () => {
  const { X } = loadDesignCritterKit();
  const colors = { f: '#dba06a', dk: '#8f5a3a', bl: '#f4d9b0' };
  const anchor = { x: 50, y: 19, w: 25, cy: 31, ny: 47.5, nw: 13, hx: 60, hy: 66 };

  it('registers exactly the 33 design accessory names', () => {
    expect(Object.keys(ACC).sort()).toEqual(Object.keys(X.ACC).sort());
    expect(Object.keys(ACC).sort()).toEqual([...ACCESSORY_NAMES].sort());
  });

  it.each(ACCESSORY_NAMES)('%s matches the design op sequence', (name) => {
    const ours = ACC[name];
    if (!ours) throw new Error(`ACC.${name} missing`);
    const design = asDesignFn(X.ACC[name], `X.ACC.${name}`);
    const { ours: oursOps, design: designOps } = buildBothCritterOps(
      ours,
      design,
      7,
      '#221e19',
      anchor,
      { sc: '#4f86ff' },
      colors,
    );
    expect(oursOps).toEqual(designOps);
  });
});

describe('drawAccessory', () => {
  const { X } = loadDesignCritterKit();
  const designAcc = asDesignFn(X.acc, 'X.acc');
  const colors = { f: '#dba06a', dk: '#8f5a3a', bl: '#f4d9b0' };
  const anchor = { x: 50, y: 19, w: 25, cy: 31, ny: 47.5, nw: 13, hx: 60, hy: 66 };

  it.each(['beret', 'scarf', 'pizza'] as const)('dispatches %s exactly like X.acc', (acc) => {
    const spec = { acc, sc: '#54d6a4' };
    const { ours, design } = buildBothCritterOps(drawAccessory, designAcc, 7, '#221e19', spec, colors, anchor);
    expect(ours).toEqual(design);
  });

  it('renders nothing for an unset or unknown accessory', () => {
    for (const spec of [{}, { acc: 'unknown-accessory' }]) {
      const { ours, design } = buildBothCritterOps(drawAccessory, designAcc, 7, '#221e19', spec, colors, anchor);
      expect(ours).toEqual([]);
      expect(design).toEqual([]);
    }
  });
});
