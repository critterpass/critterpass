import { currentRelease } from '@cp/content';
import { critters } from '@cp/critter-art';
import { describe, expect, it } from 'vitest';

import { deltaE2000 } from '../src/color/color';
import '../src/kinds/forms';
import { commonPalette } from '../src/kinds/forms/brief';
import { goldCandidates, isGold, rotatedCandidates } from '../src/kinds/forms/palette-gen';
import { paletteProblems, pickPalette } from '../src/kinds/forms/pick';
import { supportedEpicPoses } from '../src/kinds/forms/poses';
import { formValidators } from '../src/kinds/forms/validate';
import { dexEntry } from '../src/kinds/critters/brief';
import { validateCommitted } from '../src/pipeline';
import { runValidators } from '../src/validators/registry';

describe('palette generation', () => {
  it('is deterministic per form id and gives near-neutral critters a visible recolour', () => {
    const egret = commonPalette(dexEntry('cp-008'));
    expect(rotatedCandidates(egret, 'cp-008:rare', false)).toEqual(
      rotatedCandidates(egret, 'cp-008:rare', false),
    );
    const picked = pickPalette('cp-008:rare', 'rare', egret, [], [], []);
    expect(deltaE2000(picked.f, egret.f)).toBeGreaterThanOrEqual(18);
    expect(goldCandidates('cp-008:legendary').every((p) => isGold(p.f))).toBe(true);
  });

  it('refuses recolours too close to common, on tier accents or in the gold family', () => {
    const common = { f: '#54d6a4', dk: '#2e9a74', bl: '#dff7ea' };
    expect(paletteProblems('rare', common, common, [])).not.toEqual([]);
    expect(
      paletteProblems('epic', { f: '#ffd84a', dk: '#c99a2a', bl: '#fff6cc' }, common, []),
    ).toContain('the gold family is reserved for legendary forms');
  });

  it('only offers poses the archetype draws', () => {
    expect(supportedEpicPoses('cp-013')).toEqual(['wave', 'cheer', 'think']);
    expect(supportedEpicPoses('cp-053')).toEqual(['tilt', 'hop']);
  });
});

describe('form validators', { timeout: 60_000 }, () => {
  it('keep designed forms exact', () => {
    const designed = currentRelease('forms')!.items.find((f) => f.id === 'cp-112:epic')!;
    const report = runValidators('forms', [{ ...designed, name: 'Sunrise Tokek' }], formValidators);
    expect(report.items[0]?.checks.map((c) => c.id)).toContain('designed-form');
  });

  it('hold every committed forms batch to its validators, four forms per critter', () => {
    const results = validateCommitted('forms');
    expect(results.length).toBeGreaterThan(0);
    for (const { batchKey, report } of results) {
      expect(report.severity, batchKey).not.toBe('fail');
      expect(report.items.length % 4, batchKey).toBe(0);
    }
    // The latest batch is the whole kind: four forms for every critter in the dex.
    expect(results.at(-1)?.report.items).toHaveLength(critters.length * 4);
  });
});
