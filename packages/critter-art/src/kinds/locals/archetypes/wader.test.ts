import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { wader } from './wader';

const WADER_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'wader',
);

describe('wader', () => {
  const { X } = loadDesignCritterKit(true);
  const designWader = asDesignFn(X.A['wader'], 'X.A.wader');

  it('covers all 9 wader critters from the shipped data', () => {
    expect(WADER_CRITTERS).toHaveLength(9);
  });

  it.each(WADER_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        wader,
        designWader,
        no,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it.each(WADER_CRITTERS.map((c) => [c.id, c.spec] as const))(
    'matches with eyes closed for %s',
    (_id, spec) => {
      const options = fixtureOptions({ closed: true });
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        wader,
        designWader,
        205,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it('exercises every named variant at least once', () => {
    const variants = new Set(
      WADER_CRITTERS.map((c) => c.spec.v).filter((v): v is string => v !== undefined),
    );
    expect([...variants].sort()).toEqual(['flamingo', 'float', 'pelican', 'swan'].sort());
  });
});
