import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { createOpBuilder } from '../../../core/ops';
import { loadDesignCritterKit } from '../design-critter-reference';
import {
  asDesignFn,
  buildBothCritterOps,
  fixtureOptions,
  fixtureSpec,
} from '../design-critter-fixture';
import type { KindDrawOptions } from '../../registry';
import { octo } from './octo';

const COLORS = { f: '#dba06a', dk: '#8f5a3a', bl: '#f4d9b0' };
const SPEC = fixtureSpec({ b: 'octo' });

/** Probes how many seeds a call consumed by comparing the seed of an immediately-following line op. */
function probeSeedAfter(options: KindDrawOptions): number {
  const { sink, ops } = createOpBuilder(7, '#221e19');
  octo(sink, options, SPEC, COLORS);
  sink.line([
    [0, 0],
    [1, 1],
  ]);
  const probe = ops.at(-1);
  if (!probe || probe.t !== 'line') throw new Error('probe line op missing');
  return probe.seed;
}

const OCTO_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'octo',
);

describe('octo', () => {
  const { X } = loadDesignCritterKit(true);
  const designOcto = asDesignFn(X.A['octo'], 'X.A.octo');

  it('covers the single octo critter from the shipped data', () => {
    expect(OCTO_CRITTERS).toHaveLength(1);
  });

  it.each(OCTO_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        octo,
        designOcto,
        no,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  it.each(OCTO_CRITTERS.map((c) => [c.id, c.spec] as const))(
    'matches with eyes closed for %s',
    (_id, spec) => {
      const options = fixtureOptions({ closed: true });
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(
        octo,
        designOcto,
        205,
        '#221e19',
        options,
        spec,
        colors,
      );
      expect(ours).toEqual(design);
    },
  );

  describe('stable seed mode', () => {
    const base = { ink: '#221e19', eye: '#fffdf6', pupil: '#221e19' };

    it('design mode (default) reproduces the mismatch: open consumes one seed per eye more than closed', () => {
      const openSeed = probeSeedAfter({ ...base, closed: false });
      const closedSeed = probeSeedAfter({ ...base, closed: true });
      expect(openSeed).toBe(closedSeed + 2); // octo draws 2 eyes
    });

    it('stable mode reserves the missing seed so open and closed consume the same number of seeds', () => {
      const openSeed = probeSeedAfter({ ...base, closed: false, seedMode: 'stable' });
      const closedSeed = probeSeedAfter({ ...base, closed: true, seedMode: 'stable' });
      expect(openSeed).toBe(closedSeed);
    });
  });
});
