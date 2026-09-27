import { describe, expect, it } from 'vitest';

import { findDesignedForm } from '@cp/critter-art';

import { APP_ICONS, APP_ICON_IDS, buildAppIconContentLayout } from './app-icons';

describe('APP_ICON_IDS / APP_ICONS', () => {
  it('has exactly 10 unique ids (phase spec: 4 base styles + 6 earned icons)', () => {
    expect(APP_ICON_IDS).toHaveLength(10);
    expect(new Set(APP_ICON_IDS).size).toBe(10);
    expect(APP_ICONS.map((def) => def.id).sort()).toEqual([...APP_ICON_IDS].sort());
  });

  it('marks temple/pon/golden as designed and traces them to a real DESIGNED_FORMS entry', () => {
    const byId = new Map(APP_ICONS.map((def) => [def.id, def]));

    const temple = byId.get('temple');
    expect(temple?.designed).toBe(true);
    expect(temple?.character.form).toEqual(findDesignedForm('cp-112', 'rare')?.form);

    const golden = byId.get('golden');
    expect(golden?.designed).toBe(true);
    expect(golden?.character.form).toEqual(findDesignedForm('cp-112', 'legendary')?.form);

    const pon = byId.get('pon');
    expect(pon?.designed).toBe(true);
    expect(pon?.character.form).toEqual(findDesignedForm('cp-061', 'legendary')?.form);
  });

  it('flags the 3 undesigned earned-icon mappings with a founder-reviewable note', () => {
    const byId = new Map(APP_ICONS.map((def) => [def.id, def]));
    for (const id of ['sardi', 'home-set', 'bali-six'] as const) {
      const def = byId.get(id);
      expect(def?.designed).toBe(false);
    }
    expect(byId.get('home-set')?.note).toBeTruthy();
    expect(byId.get('bali-six')?.note).toBeTruthy();
    // Sardi is a direct guide-name match (docs/product-decisions.md's "Sardi" = sardine, Lisbon),
    // not an open question — it gets no note.
    expect(byId.get('sardi')?.note).toBeUndefined();
  });

  it('gives every icon a transparent, non-empty content layout', () => {
    for (const def of APP_ICONS) {
      const layout = buildAppIconContentLayout(def);
      expect(layout.width).toBeGreaterThan(0);
      expect(layout.height).toBeGreaterThan(0);
      expect(layout.background).toBe('transparent');
      expect(layout.nodes.length).toBeGreaterThan(0);
    }
  });

  it('only the stamp icon carries a city label', () => {
    for (const def of APP_ICONS) {
      if (def.id === 'stamp') expect(def.label).toBe('HÀ NỘI');
      else expect(def.label).toBeUndefined();
    }
  });
});
