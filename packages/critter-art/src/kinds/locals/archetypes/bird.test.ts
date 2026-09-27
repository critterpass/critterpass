import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { bird } from './bird';

const BIRD_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'bird',
);

describe('bird', () => {
  const { X } = loadDesignCritterKit(true);
  const designBird = asDesignFn(X.A['bird'], 'X.A.bird');

  it('covers all 24 bird critters from the shipped data', () => {
    expect(BIRD_CRITTERS).toHaveLength(24);
  });

  it.each(BIRD_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette, idle pose',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        bird,
        designBird,
        no,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it.each(BIRD_CRITTERS.map((c) => [c.id, c.spec] as const))(
    'matches with eyes closed for %s',
    (_id, spec) => {
      const options = fixtureOptions({ closed: true });
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        bird,
        designBird,
        205,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it.each(['wave', 'cheer'] as const)(
    'matches every pose using a raptor (cp-046, Maying)',
    (pose) => {
      const maying = BIRD_CRITTERS.find((c) => c.id === 'cp-046');
      if (!maying) throw new Error('cp-046 missing from generated data');
      const options = fixtureOptions({ pose });
      const colors = { f: maying.spec.c[0], dk: maying.spec.c[1], bl: maying.spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        bird,
        designBird,
        7,
        '#221e19',
        options,
        maying.spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it('exercises every named variant at least once', () => {
    const variants = new Set(
      BIRD_CRITTERS.map((c) => c.spec.v).filter((v): v is string => v !== undefined),
    );
    expect(variants.size).toBe(17);
  });
});
