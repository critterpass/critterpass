import { contrastRatio, tokens } from '@cp/design-tokens';
import { describe, expect, it } from 'vitest';

import { critters } from '../data/critters';
import {
  GUIDE_ACCENT_MIN_RATIO,
  GUIDE_FACTS,
  GUIDE_SLUG_PATTERN,
  guideAccent,
  guideAccentOnPaper,
  guideFactsByKey,
  guideFactsBySlug,
  guideLook,
  guideSlug,
} from './index';

describe('guide slugs', () => {
  it('folds a name to plain lowercase letters', () => {
    expect(guideSlug('Ngựa')).toBe('ngua');
    expect(guideSlug('Chà Vá')).toBe('chava');
    expect(guideSlug('Kri-kri')).toBe('krikri');
    expect(guideSlug('Méďa')).toBe('meda');
    expect(guideSlug('Đông Østraße')).toBe('dongostrasse');
  });

  it('gives every dex critter a unique slug the surfaces accept', () => {
    expect(GUIDE_FACTS).toHaveLength(critters.length);
    for (const facts of GUIDE_FACTS) expect(facts.slug, facts.name).toMatch(GUIDE_SLUG_PATTERN);
    expect(new Set(GUIDE_FACTS.map((facts) => facts.slug)).size).toBe(GUIDE_FACTS.length);
  });

  it('finds a guide by slug and by dex key', () => {
    expect(guideFactsBySlug('ngua')).toMatchObject({
      key: 'cp-006',
      name: 'Ngựa',
      species: 'Flower pony',
      city: 'Đà Lạt',
      country: 'Vietnam',
    });
    expect(guideFactsByKey('cp-151')?.slug).toBe('chava');
    expect(guideFactsBySlug('nobody')).toBeUndefined();
  });
});

describe('guide accents', () => {
  it('keeps the slug, name and colour of the guides that have a token colour', () => {
    const kept = GUIDE_FACTS.filter((facts) => facts.colours === null).map((facts) => ({
      key: facts.key,
      slug: facts.slug,
      name: facts.name,
      ...guideLook(facts.slug, facts.colours),
    }));
    expect(kept).toEqual([
      { key: 'cp-041', slug: 'ajo', name: 'Ajo', accent: tokens.guide.ajo, colour: 'pink' },
      { key: 'cp-061', slug: 'pon', name: 'Pon', accent: tokens.guide.pon, colour: 'orange' },
      { key: 'cp-076', slug: 'sardi', name: 'Sardi', accent: tokens.guide.sardi, colour: 'green' },
      { key: 'cp-112', slug: 'tokek', name: 'Tokek', accent: tokens.guide.tokek, colour: 'yellow' },
      { key: 'cp-145', slug: 'paco', name: 'Paco', accent: tokens.guide.paco, colour: 'cream' },
      { key: 'cp-148', slug: 'lundi', name: 'Lundi', accent: tokens.guide.lundi, colour: 'blue' },
      { key: 'cp-151', slug: 'chava', name: 'Chà Vá', accent: tokens.guide.chava, colour: 'red' },
    ]);
  });

  it('reads under dark text and, darkened, on paper for every other critter', () => {
    for (const facts of GUIDE_FACTS.filter((entry) => entry.colours !== null)) {
      const accent = guideAccent(facts.slug, facts.colours);
      expect(accent, facts.name).toMatch(/^#[0-9a-f]{6}$/);
      expect(
        contrastRatio(tokens.semantic.text.onAccent, accent),
        facts.name,
      ).toBeGreaterThanOrEqual(GUIDE_ACCENT_MIN_RATIO);
      expect(
        contrastRatio(guideAccentOnPaper(accent), tokens.color.paper.base),
        facts.name,
      ).toBeGreaterThanOrEqual(GUIDE_ACCENT_MIN_RATIO);
    }
  });

  it('takes the first own colour that reads, else lightens the first', () => {
    expect(guideAccent('ngua', ['#fff1d6', '#ff8fbf', '#fffaf0'])).toBe('#fff1d6');
    expect(guideAccent('newcomer', ['#2a2a40', '#54d6a4', '#ffffff'])).toBe('#54d6a4');
    const lightened = guideAccent('newcomer', ['#402010', '#301008', '#201008']);
    expect(lightened).not.toBe('#402010');
    expect(contrastRatio(tokens.semantic.text.onAccent, lightened)).toBeGreaterThanOrEqual(
      GUIDE_ACCENT_MIN_RATIO,
    );
  });
});
