import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { seal } from './seal';

const SEAL_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'seal',
);

describe('seal', () => {
  const { X } = loadDesignCritterKit(true);
  const designSeal = asDesignFn(X.A['seal'], 'X.A.seal');

  it('covers all 3 seal critters from the shipped data', () => {
    expect(SEAL_CRITTERS).toHaveLength(3);
  });

  it.each(SEAL_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(seal, designSeal, no, '#221e19', options, spec, colors);
      expect(ours).toEqual(design);
    },
  );

  it.each(SEAL_CRITTERS.map((c) => [c.id, c.spec] as const))('matches with eyes closed for %s', (_id, spec) => {
    const options = fixtureOptions({ closed: true });
    const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
    const { ours, design } = buildBothCritterOps(seal, designSeal, 205, '#221e19', options, spec, colors);
    expect(ours).toEqual(design);
  });

  it('has one dugong and two plain-default seals', () => {
    expect(SEAL_CRITTERS.filter((c) => c.spec.v === 'dugong')).toHaveLength(1);
    expect(SEAL_CRITTERS.filter((c) => c.spec.v === undefined)).toHaveLength(2);
  });
});
