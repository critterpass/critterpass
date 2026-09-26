import { describe, expect, it } from 'vitest';

import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps } from '../design-critter-fixture';
import { drawHorns } from './horns';

const HORN_TYPES = ['back', 'straight', 'hook', 'nub', 'ossi', 'bull', 'antler', 'palm', 'moose', 'curl'] as const;

describe('drawHorns', () => {
  const { X } = loadDesignCritterKit();
  const designHorns = asDesignFn(X.horns, 'X.horns');
  const colors = { f: '#c98a5a', dk: '#5a3424', bl: '#f4d9b0' };
  const head = { x: 50, y: 21, k: 0.7 };

  it.each(HORN_TYPES)('matches the design op sequence for horn type %s', (type) => {
    const { ours, design } = buildBothCritterOps(drawHorns, designHorns, 7, '#221e19', type, head, colors, {});
    expect(ours).toEqual(design);
  });

  it('matches the design op sequence with an hc2 override', () => {
    const { ours, design } = buildBothCritterOps(drawHorns, designHorns, 7, '#221e19', 'straight', head, colors, {
      hc2: '#3a3466',
    });
    expect(ours).toEqual(design);
  });

  it('renders nothing for an unknown or undefined horn type', () => {
    for (const type of [undefined, 'unknown-horn']) {
      const { ours, design } = buildBothCritterOps(drawHorns, designHorns, 7, '#221e19', type, head, colors, {});
      expect(ours).toEqual([]);
      expect(design).toEqual([]);
    }
  });
});
