import { describe, expect, it } from 'vitest';

import { critters } from '../../data/critters';
import { isGuideSpec } from '../../data/types';
import { build } from '../../core/model';
import { frame } from '../../core/frame';
import { hasKind, resolveKind } from '../registry';

const LOCAL_CRITTERS = critters.filter((c) => !isGuideSpec(c.spec));
const GUIDE_CRITTERS = critters.filter((c) => isGuideSpec(c.spec));

describe('registerLocalKinds (via src/kinds/registry)', () => {
  it('registers all 151 critters (144 locals + 7 guide aliases)', () => {
    expect(critters).toHaveLength(151);
    expect(LOCAL_CRITTERS).toHaveLength(144);
    expect(GUIDE_CRITTERS).toHaveLength(7);
    for (const c of critters) expect(hasKind(c.id)).toBe(true);
  });

  it('covers all 15 archetypes across the 144 locals', () => {
    const archetypes = new Set(LOCAL_CRITTERS.map((c) => (isGuideSpec(c.spec) ? null : c.spec.b)));
    expect(archetypes.size).toBe(15);
  });

  it('resolves every guide cp-id to its hand-drawn guide kind', () => {
    for (const guide of GUIDE_CRITTERS) {
      if (!isGuideSpec(guide.spec)) throw new Error('unreachable');
      expect(hasKind(guide.id)).toBe(true);
      const aliased = resolveKind(guide.id);
      const direct = resolveKind(guide.spec.k);
      expect(aliased.fn).toBe(direct.fn);
      expect(aliased.animates).toBe(true);
    }
  });

  it('build/frame render one real critter from every archetype end to end', () => {
    const archetypes = new Set(LOCAL_CRITTERS.map((c) => (isGuideSpec(c.spec) ? null : c.spec.b)));
    for (const archetype of archetypes) {
      const sample = LOCAL_CRITTERS.find((c) => !isGuideSpec(c.spec) && c.spec.b === archetype);
      if (!sample) throw new Error(`no critter for archetype "${String(archetype)}"`);
      const model = build({ kind: sample.id, seed: 7 }, 96);
      const cmds = frame(model, 1);
      expect(cmds.length).toBeGreaterThan(0);
      expect(model.ops.length).toBeGreaterThan(0);
    }
  });
});
