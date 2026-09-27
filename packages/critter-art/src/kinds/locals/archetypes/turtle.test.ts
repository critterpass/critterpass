import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { turtle } from './turtle';

const TURTLE_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'turtle',
);

describe('turtle', () => {
  const { X } = loadDesignCritterKit(true);
  const designTurtle = asDesignFn(X.A['turtle'], 'X.A.turtle');

  it('covers both turtle critters from the shipped data', () => {
    expect(TURTLE_CRITTERS).toHaveLength(2);
  });

  it.each(TURTLE_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        turtle,
        designTurtle,
        no,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it.each(TURTLE_CRITTERS.map((c) => [c.id, c.spec] as const))(
    'matches with eyes closed for %s',
    (_id, spec) => {
      const options = fixtureOptions({ closed: true });
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        turtle,
        designTurtle,
        205,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it('has one sea turtle and one plain (accessory-bearing) turtle', () => {
    expect(TURTLE_CRITTERS.some((c) => c.spec.v === 'sea')).toBe(true);
    expect(TURTLE_CRITTERS.some((c) => c.spec.acc === 'sword')).toBe(true);
  });
});
