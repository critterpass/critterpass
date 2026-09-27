import { describe, expect, it } from 'vitest';

import { critters } from '../../../data/critters';
import { isGuideSpec } from '../../../data/types';
import type { CritterSpec } from '../../../data/types';
import { loadDesignCritterKit } from '../design-critter-reference';
import { asDesignFn, buildBothCritterOps, fixtureOptions } from '../design-critter-fixture';
import { snake } from './snake';

const SNAKE_CRITTERS = critters.filter(
  (c): c is typeof c & { spec: CritterSpec } => !isGuideSpec(c.spec) && c.spec.b === 'snake',
);

describe('snake', () => {
  const { X } = loadDesignCritterKit(true);
  const designSnake = asDesignFn(X.A['snake'], 'X.A.snake');

  it('covers both snake critters from the shipped data', () => {
    expect(SNAKE_CRITTERS).toHaveLength(2);
  });

  it.each(SNAKE_CRITTERS.map((c) => [c.id, c.name, c.no, c.spec] as const))(
    'matches the design op sequence for %s (%s), default palette',
    (_id, _name, no, spec) => {
      const options = fixtureOptions();
      const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
      const { ours, design } = buildBothCritterOps(snake, designSnake, no, '#221e19', options, spec, colors);
      expect(ours).toEqual(design);
    },
  );

  it.each(SNAKE_CRITTERS.map((c) => [c.id, c.spec] as const))('matches with eyes closed for %s', (_id, spec) => {
    const options = fixtureOptions({ closed: true });
    const colors = { f: spec.c[0], dk: spec.c[1], bl: spec.c[2] };
    const { ours, design } = buildBothCritterOps(snake, designSnake, 205, '#221e19', options, spec, colors);
    expect(ours).toEqual(design);
  });

  it('has one naga and one crowned-serpent (default variant, acc=crown)', () => {
    expect(SNAKE_CRITTERS.some((c) => c.spec.v === 'naga')).toBe(true);
    expect(SNAKE_CRITTERS.some((c) => c.spec.v === undefined && c.spec.acc === 'crown')).toBe(true);
  });
});
