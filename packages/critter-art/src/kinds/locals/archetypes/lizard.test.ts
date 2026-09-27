import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { lizard } from './lizard';

const LIZARD_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'lizard',
);

describe('lizard', () => {
  const { X } = loadDesignCritterKit(true);
  const designLizard = asDesignFn(X.A['lizard'], 'X.A.lizard');

  it('covers all 7 lizard critters from the shipped data', () => {
    expect(LIZARD_CRITTERS).toHaveLength(7);
  });

  it.each(LIZARD_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(lizard, designLizard, no, '#221e19', options, spec, colors);
      expect(ours).toEqual(design);
    },
  );

  it.each(LIZARD_CRITTERS.map((c) => [c.id, c.spec] as const))('matches with eyes closed for %s', (_id, spec) => {
    const options = fixtureOptions({ closed: true });
    const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
    const { ours, design } = buildBothCritterOps(lizard, designLizard, 205, '#221e19', options, spec, colors);
    expect(ours).toEqual(design);
  });

  it.each(['wave', 'cheer'] as const)('matches every pose using the plain default variant (Drac, cp-016)', (pose) => {
    const drac = LIZARD_CRITTERS.find((c) => c.id === 'cp-016');
    if (!drac) throw new Error('cp-016 missing from generated data');
    const options = fixtureOptions({ pose });
    const colors = { f: drac.spec.c[0], dk: drac.spec.c[1], bl: drac.spec.c[2] };
    const { ours, design } = buildBothCritterOps(lizard, designLizard, 7, '#221e19', options, drac.spec, colors);
    expect(ours).toEqual(design);
  });

  it('exercises every named variant at least once', () => {
    const variants = new Set(LIZARD_CRITTERS.map((c) => c.spec.v).filter((v): v is string => v !== undefined));
    expect([...variants].sort()).toEqual(['croc', 'dragon', 'komodo', 'slim', 'smok'].sort());
  });
});
