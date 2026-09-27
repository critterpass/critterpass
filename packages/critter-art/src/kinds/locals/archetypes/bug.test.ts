import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { bug } from './bug';

const BUG_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'bug',
);

describe('bug', () => {
  const { X } = loadDesignCritterKit(true);
  const designBug = asDesignFn(X.A['bug'], 'X.A.bug');

  it('covers all 6 bug critters from the shipped data', () => {
    expect(BUG_CRITTERS).toHaveLength(6);
    expect(new Set(BUG_CRITTERS.map((c) => c.spec.v)).size).toBe(6);
  });

  it.each(BUG_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(bug, designBug, no, '#221e19', options, spec, colors);
      expect(ours).toEqual(design);
    },
  );

  it.each(BUG_CRITTERS.map((c) => [c.id, c.spec] as const))('matches with eyes closed for %s', (_id, spec) => {
    const options = fixtureOptions({ closed: true });
    const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
    const { ours, design } = buildBothCritterOps(bug, designBug, 205, '#221e19', options, spec, colors);
    expect(ours).toEqual(design);
  });

  it('renders nothing for an unknown bug variant', () => {
    const options = fixtureOptions();
    const colors = { f: '#fff', dk: '#000', bl: '#eee' };
    const spec = { b: 'bug' as const, c: ['#fff', '#000', '#eee'] as const, v: 'unknown' };
    const { ours, design } = buildBothCritterOps(bug, designBug, 7, '#221e19', options, spec, colors);
    expect(ours).toEqual([]);
    expect(design).toEqual([]);
  });
});
