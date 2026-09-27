import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { fish } from './fish';

const FISH_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'fish',
);

describe('fish', () => {
  const { X } = loadDesignCritterKit(true);
  const designFish = asDesignFn(X.A['fish'], 'X.A.fish');

  it('covers all 10 fish critters from the shipped data', () => {
    expect(FISH_CRITTERS).toHaveLength(10);
  });

  it.each(FISH_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        fish,
        designFish,
        no,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it.each(FISH_CRITTERS.map((c) => [c.id, c.spec] as const))(
    'matches with eyes closed for %s',
    (_id, spec) => {
      const options = fixtureOptions({ closed: true });
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        fish,
        designFish,
        205,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it('exercises every fish variant at least once', () => {
    const variants = new Set(
      FISH_CRITTERS.map((c) => c.spec.v).filter((v): v is string => v !== undefined),
    );
    expect([...variants].sort()).toEqual(
      ['betta', 'carp', 'gold', 'long', 'mud', 'puffer', 'shark', 'tall'].sort(),
    );
  });
});
