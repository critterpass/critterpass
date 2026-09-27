import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { sit } from './sit';

const SIT_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'sit',
);

describe('sit', () => {
  const { X } = loadDesignCritterKit();
  const designSit = asDesignFn(X.A['sit'], 'X.A.sit');

  it('covers all 51 sit critters from the shipped data', () => {
    expect(SIT_CRITTERS).toHaveLength(51);
  });

  it.each(SIT_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette, idle pose',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        sit,
        designSit,
        no,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it.each(SIT_CRITTERS.map((c) => [c.id, c.spec] as const))(
    'matches with eyes closed for %s',
    (_id, spec) => {
      const options = fixtureOptions({ closed: true });
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        sit,
        designSit,
        205,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it.each(['wave', 'cheer', 'think'] as const)(
    'matches every non-idle pose using Léon (cp-013)',
    (pose) => {
      const leon = SIT_CRITTERS.find((c) => c.id === 'cp-013');
      if (!leon) throw new Error('cp-013 missing from generated data');
      const options = fixtureOptions({ pose });
      const colors = { f: leon.spec.c[0], dk: leon.spec.c[1], bl: leon.spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        sit,
        designSit,
        7,
        '#221e19',
        options,
        leon.spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it('matches with a full custom palette override', () => {
    const rimau = SIT_CRITTERS.find((c) => c.id === 'cp-119');
    if (!rimau) throw new Error('cp-119 (Rimau) missing from generated data');
    const options = fixtureOptions({
      fill: '#ff9a4d',
      spot: '#c4623e',
      belly: '#fff1e6',
      eye: '#fff6e6',
      pupil: '#12100e',
    });
    const colors = { f: '#ff9a4d', dk: '#c4623e', bl: '#fff1e6' };
    const { ours, design } = buildBothCritterOps(
      sit,
      designSit,
      41,
      '#12100e',
      options,
      rimau.spec,
      colors,
    );
    expect(ours).toEqual(design);
  });

  it('the puli variant (Budapest, cp-135) short-circuits before the shared body pipeline', () => {
    const puli = SIT_CRITTERS.find((c) => c.spec.v === 'puli');
    if (!puli) throw new Error('no puli-variant critter in generated data');
    const options = fixtureOptions();
    const colors = { f: puli.spec.c[0], dk: puli.spec.c[1], bl: puli.spec.c[2] };
    const { ours, design } = buildBothCritterOps(
      sit,
      designSit,
      7,
      '#221e19',
      options,
      puli.spec,
      colors,
    );
    expect(ours).toEqual(design);
    expect(ours.length).toBeGreaterThan(0);
  });
});
