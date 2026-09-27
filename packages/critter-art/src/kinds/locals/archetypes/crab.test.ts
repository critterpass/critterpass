import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { crab } from './crab';

const CRAB_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'crab',
);

describe('crab', () => {
  const { X } = loadDesignCritterKit(true);
  const designCrab = asDesignFn(X.A['crab'], 'X.A.crab');

  it('covers the single crab critter from the shipped data', () => {
    expect(CRAB_CRITTERS).toHaveLength(1);
  });

  it.each(CRAB_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(crab, designCrab, no, '#221e19', options, spec, colors);
      expect(ours).toEqual(design);
    },
  );

  it.each(CRAB_CRITTERS.map((c) => [c.id, c.spec] as const))('matches with eyes closed for %s', (_id, spec) => {
    const options = fixtureOptions({ closed: true });
    const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
    const { ours, design } = buildBothCritterOps(crab, designCrab, 205, '#221e19', options, spec, colors);
    expect(ours).toEqual(design);
  });
});
