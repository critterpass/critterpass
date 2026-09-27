import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { nessie } from './nessie';

const NESSIE_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'nessie',
);

describe('nessie', () => {
  const { X } = loadDesignCritterKit(true);
  const designNessie = asDesignFn(X.A['nessie'], 'X.A.nessie');

  it('covers the single nessie critter from the shipped data', () => {
    expect(NESSIE_CRITTERS).toHaveLength(1);
  });

  it.each(NESSIE_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(nessie, designNessie, no, '#221e19', options, spec, colors);
      expect(ours).toEqual(design);
    },
  );

  it.each(NESSIE_CRITTERS.map((c) => [c.id, c.spec] as const))('matches with eyes closed for %s', (_id, spec) => {
    const options = fixtureOptions({ closed: true });
    const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
    const { ours, design } = buildBothCritterOps(nessie, designNessie, 205, '#221e19', options, spec, colors);
    expect(ours).toEqual(design);
  });
});
