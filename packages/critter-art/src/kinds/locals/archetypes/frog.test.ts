import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { frog } from './frog';

const FROG_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'frog',
);

describe('frog', () => {
  const { X } = loadDesignCritterKit(true);
  const designFrog = asDesignFn(X.A['frog'], 'X.A.frog');

  it('covers all 3 frog critters from the shipped data', () => {
    expect(FROG_CRITTERS).toHaveLength(3);
  });

  it.each(FROG_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        frog,
        designFrog,
        no,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it.each(FROG_CRITTERS.map((c) => [c.id, c.spec] as const))(
    'matches with eyes closed for %s',
    (_id, spec) => {
      const options = fixtureOptions({ closed: true });
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        frog,
        designFrog,
        205,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it('has one red-eyed tree frog and one plain tree frog', () => {
    const tree = FROG_CRITTERS.filter((c) => c.spec.v === 'tree');
    expect(tree).toHaveLength(2);
    expect(tree.some((c) => c.spec.red === 1)).toBe(true);
    expect(tree.some((c) => c.spec.red === undefined)).toBe(true);
  });
});
