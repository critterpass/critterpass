import { describe, expect, it } from 'vitest';

import { critters } from '../../data/critters';
import { isGuideSpec } from '../../data/types';
import { build } from '../../core/model';
import { frame } from '../../core/frame';
import { hasKind, resolveKind } from '../registry';

const SIT_AND_STAND_IDS = critters
  .filter((c) => !isGuideSpec(c.spec) && (c.spec.b === 'sit' || c.spec.b === 'stand'))
  .map((c) => c.id);

const GUIDE_CRITTERS = critters.filter((c) => isGuideSpec(c.spec));

describe('registerLocalKinds (via src/kinds/registry)', () => {
  it('registers all 71 sit/stand critters', () => {
    expect(SIT_AND_STAND_IDS).toHaveLength(71);
    for (const id of SIT_AND_STAND_IDS) expect(hasKind(id)).toBe(true);
  });

  it('does not yet register archetypes T6 has not ported', () => {
    const unported = critters.filter(
      (c) => !isGuideSpec(c.spec) && c.spec.b !== 'sit' && c.spec.b !== 'stand',
    );
    expect(unported.length).toBeGreaterThan(0);
    for (const c of unported) expect(hasKind(c.id)).toBe(false);
  });

  it('resolves every guide cp-id to its hand-drawn guide kind', () => {
    expect(GUIDE_CRITTERS).toHaveLength(6);
    for (const guide of GUIDE_CRITTERS) {
      if (!isGuideSpec(guide.spec)) throw new Error('unreachable');
      expect(hasKind(guide.id)).toBe(true);
      const aliased = resolveKind(guide.id);
      const direct = resolveKind(guide.spec.k);
      expect(aliased.fn).toBe(direct.fn);
      expect(aliased.animates).toBe(true);
    }
  });

  it('build/frame render a real sit critter (Léon, cp-013) end to end', () => {
    const model = build({ kind: 'cp-013', seed: 7 }, 96);
    const cmds = frame(model, 1);
    expect(cmds.length).toBeGreaterThan(0);
    expect(model.ops.length).toBeGreaterThan(0);
  });

  it('build/frame render a real stand critter (Peri, cp-033) end to end', () => {
    const model = build({ kind: 'cp-033', seed: 7 }, 96);
    const cmds = frame(model, 1);
    expect(cmds.length).toBeGreaterThan(0);
    expect(model.ops.length).toBeGreaterThan(0);
  });
});
