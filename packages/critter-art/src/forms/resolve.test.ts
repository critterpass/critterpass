import { describe, expect, it } from 'vitest';

import { critters } from '../data/critters';
import { isGuideSpec } from '../data/types';
import { build } from '../core/model';
import { frame } from '../core/frame';
import { DESIGNED_FORMS } from './designed';
import { canonicalSeed, findDesignedForm, resolveRenderSpec } from './resolve';

describe('canonicalSeed', () => {
  it('uses the CritterDex `no` for locals', () => {
    const leon = critters.find((c) => c.id === 'cp-013');
    if (!leon) throw new Error('cp-013 missing');
    expect(canonicalSeed(leon)).toBe(13);
  });

  it('uses 7 for every guide', () => {
    for (const guide of critters.filter((c) => isGuideSpec(c.spec))) {
      expect(canonicalSeed(guide)).toBe(7);
    }
  });
});

describe('findDesignedForm', () => {
  it('finds all 4 designed fixtures by critter id + rarity', () => {
    expect(findDesignedForm('cp-112', 'rare')?.name).toBe('Temple Tokek');
    expect(findDesignedForm('cp-112', 'epic')?.name).toBe('Epic Tokek');
    expect(findDesignedForm('cp-112', 'legendary')?.name).toBe('Golden Tokek');
    expect(findDesignedForm('cp-061', 'legendary')?.name).toBe('Sakura Pon');
  });

  it('returns undefined for a critter/rarity with no designed fixture', () => {
    expect(findDesignedForm('cp-013', 'epic')).toBeUndefined();
    expect(findDesignedForm('cp-112', 'common')).toBeUndefined();
  });
});

describe('resolveRenderSpec', () => {
  it('defaults kind and seed from the critter, keeping overrides', () => {
    const chueli = critters.find((c) => c.id === 'cp-115');
    if (!chueli) throw new Error('cp-115 missing');
    const spec = resolveRenderSpec(chueli, { closedEyes: true });
    expect(spec.kind).toBe('cp-115');
    expect(spec.seed).toBe(115);
    expect(spec.closedEyes).toBe(true);
  });

  it('accepts a designed form as an override', () => {
    const tokek = critters.find((c) => c.id === 'cp-112');
    if (!tokek) throw new Error('cp-112 missing');
    const designedRare = findDesignedForm('cp-112', 'rare');
    if (!designedRare) throw new Error('designed rare Tokek missing');
    const spec = resolveRenderSpec(tokek, { form: designedRare.form });
    expect(spec.form?.rarity).toBe('rare');
    expect(spec.form?.palette.f).toBe('#54d6a4');
  });
});

describe('DESIGNED_FORMS', () => {
  it('covers exactly Tokek (rare/epic/legendary) and Pon (legendary)', () => {
    expect(DESIGNED_FORMS).toHaveLength(4);
    expect(DESIGNED_FORMS.filter((f) => f.critterId === 'cp-112')).toHaveLength(3);
    expect(DESIGNED_FORMS.filter((f) => f.critterId === 'cp-061')).toHaveLength(1);
  });

  it('epic and legendary forms carry a pink/gold edge respectively; rare carries none', () => {
    expect(findDesignedForm('cp-112', 'rare')?.form.edge).toBe('none');
    expect(findDesignedForm('cp-112', 'epic')?.form.edge).toBe('epic');
    expect(findDesignedForm('cp-112', 'legendary')?.form.edge).toBe('legendary');
    expect(findDesignedForm('cp-061', 'legendary')?.form.edge).toBe('legendary');
  });

  it.each(DESIGNED_FORMS)(
    '$name builds and frames at 96/150/300pt with a sticker, incl. the edge ring where designed',
    (designed) => {
      for (const sizePt of [96, 150, 300]) {
        const model = build(
          { kind: designed.kind, seed: 7, form: designed.form, sticker: { color: '#f4efe4' } },
          sizePt,
        );
        expect(model.ops.length).toBeGreaterThan(0);
        if (designed.form.edge !== 'none') {
          expect(model.edgeOutline).not.toBeNull();
          expect(model.edgeColor).not.toBeNull();
        }
        const cmds = frame(model, 1);
        expect(cmds.length).toBeGreaterThan(0);
      }
    },
  );
});
