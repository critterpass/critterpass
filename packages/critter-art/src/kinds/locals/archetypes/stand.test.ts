import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { stand } from './stand';

const STAND_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'stand',
);

describe('stand', () => {
  const { X } = loadDesignCritterKit();
  const designStand = asDesignFn(X.A['stand'], 'X.A.stand');

  it('covers all 20 stand critters from the shipped data', () => {
    expect(STAND_CRITTERS).toHaveLength(20);
  });

  it.each(STAND_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(stand, designStand, no, '#221e19', options, spec, colors);
      expect(ours).toEqual(design);
    },
  );

  it.each(STAND_CRITTERS.map((c) => [c.id, c.spec] as const))('matches with eyes closed for %s', (_id, spec) => {
    const options = fixtureOptions({ closed: true });
    const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
    const { ours, design } = buildBothCritterOps(stand, designStand, 205, '#221e19', options, spec, colors);
    expect(ours).toEqual(design);
  });

  it('matches with a full custom palette override on the elephant variant', () => {
    const chang = STAND_CRITTERS.find((c) => c.spec.v === 'elephant');
    if (!chang) throw new Error('no elephant-variant critter in generated data');
    const options = fixtureOptions({ fill: '#ffd08a', spot: '#c97a3a', belly: '#fff1dc', eye: '#fff6e6', pupil: '#12100e' });
    const colors = { f: '#ffd08a', dk: '#c97a3a', bl: '#fff1dc' };
    const { ours, design } = buildBothCritterOps(stand, designStand, 41, '#12100e', options, chang.spec, colors);
    expect(ours).toEqual(design);
  });

  it('exercises every named variant at least once', () => {
    const variants = new Set(STAND_CRITTERS.map((c) => c.spec.v).filter((v): v is string => v !== undefined));
    expect([...variants].sort()).toEqual(
      ['buffalo', 'camel', 'cow', 'dachshund', 'elephant', 'giraffe', 'guanaco', 'horse', 'moose'].sort(),
    );
  });
});
