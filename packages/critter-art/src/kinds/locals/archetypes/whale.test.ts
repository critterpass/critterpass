import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { whale } from './whale';

const WHALE_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'whale',
);

describe('whale', () => {
  const { X } = loadDesignCritterKit(true);
  const designWhale = asDesignFn(X.A['whale'], 'X.A.whale');

  it('covers all 4 whale critters from the shipped data', () => {
    expect(WHALE_CRITTERS).toHaveLength(4);
  });

  it.each(WHALE_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(whale, designWhale, no, '#221e19', options, spec, colors);
      expect(ours).toEqual(design);
    },
  );

  it.each(WHALE_CRITTERS.map((c) => [c.id, c.spec] as const))('matches with eyes closed for %s', (_id, spec) => {
    const options = fixtureOptions({ closed: true });
    const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
    const { ours, design } = buildBothCritterOps(whale, designWhale, 205, '#221e19', options, spec, colors);
    expect(ours).toEqual(design);
  });

  it('exercises every named variant at least once', () => {
    const variants = new Set(WHALE_CRITTERS.map((c) => c.spec.v).filter((v): v is string => v !== undefined));
    expect([...variants].sort()).toEqual(['dolphin', 'humpback', 'orca'].sort());
  });
});
