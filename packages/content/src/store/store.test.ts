import { describe, expect, it } from 'vitest';

import en from './listing/en.json' with { type: 'json' };
import {
  listingSchema,
  parseShotTemplates,
  shotLocales,
  storeListings,
  storeShotTemplates,
  type ShotTemplate,
} from './index';

const issues = (patch: (copy: typeof en) => void): string[] => {
  const copy = structuredClone(en);
  patch(copy);
  const parsed = listingSchema.safeParse(copy);
  return parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('store listings', () => {
  it('ships an English listing inside every store limit', () => {
    expect(storeListings().en?.appStore.name).toBe('CritterPass: Group Trips');
  });

  it('refuses copy over a store limit', () => {
    expect(issues((c) => (c.appStore.name = 'CritterPass: Group Trips For All'))).toEqual([
      'appStore.name: at most 30 characters',
    ]);
    expect(issues((c) => (c.play.shortDescription = 'x'.repeat(81)))).toEqual([
      'play.shortDescription: at most 80 characters',
    ]);
    expect(issues((c) => (c.inAppEvents[0]!.shortDescription = 'x'.repeat(51)))).toHaveLength(1);
  });

  it('refuses a keyword field over 100 bytes, repeats, and words the name already covers', () => {
    expect(issues((c) => c.appStore.keywords.push('backpacking'))).toEqual([
      'appStore.keywords: keywords: at most 100 bytes',
    ]);
    expect(issues((c) => (c.appStore.keywords = ['travel', 'Travel']))).toEqual([
      'appStore.keywords: keywords repeat',
    ]);
    expect(issues((c) => (c.appStore.keywords = ['trips']))).toEqual([
      'appStore.keywords: keyword "trips" is already in the name or subtitle',
    ]);
  });

  it('refuses a price in any copy, since each store localises prices', () => {
    expect(issues((c) => (c.appStore.promoText = 'Pass+ for $3.99 a month'))).toHaveLength(1);
    expect(issues((c) => (c.play.fullDescription += ' Only 99.000₫.'))).toHaveLength(1);
    expect(issues((c) => (c.appStore.promoText = 'Plan 3 days, 4 friends, 1 bill'))).toEqual([]);
  });

  it('ships a Vietnamese listing inside every store limit', () => {
    const vi = storeListings().vi;
    expect(vi?.appStore.name.length).toBeLessThanOrEqual(30);
    expect(vi?.play.shortDescription.length).toBeLessThanOrEqual(80);
    expect(vi?.customProductPages.map((page) => page.id)).toEqual(
      storeListings().en?.customProductPages.map((page) => page.id),
    );
  });
});

describe('store shots', () => {
  const templates = storeShotTemplates();
  const [first] = templates;

  it('orders the shots and captions each one in every listed language', () => {
    expect(templates.map((template) => template.id)).toEqual([
      'vote',
      'critters',
      'plan',
      'trip-day',
      'money',
    ]);
    expect(shotLocales(templates, ['en', 'vi'])).toEqual(['en', 'vi']);
  });

  it('refuses a caption that is too long or states a price', () => {
    const withHeadline = (headline: string) => [
      { ...first, caption: { en: { headline, sub: 'Split it.' } } },
    ];
    expect(() => parseShotTemplates(withHeadline('X'.repeat(49)))).toThrow(/at most 48/u);
    expect(() => parseShotTemplates(withHeadline('PASS+ FOR $3.99'))).toThrow(/no prices/u);
    expect(() => parseShotTemplates([{ ...first, caption: { vi: first?.caption.vi } }])).toThrow(
      /English caption/u,
    );
    expect(() => parseShotTemplates([first, first])).toThrow(/repeat an id/u);
  });

  it('makes shots only in languages that have a listing and every caption', () => {
    const englishOnly: ShotTemplate[] = templates.map((template, index) => {
      const en = template.caption.en;
      return index === 0 && en !== undefined ? { ...template, caption: { en } } : template;
    });
    expect(shotLocales(englishOnly, ['en', 'vi'])).toEqual(['en']);
    expect(shotLocales(templates, ['en', 'vi'], ['vi'])).toEqual(['vi']);
    expect(() => shotLocales(englishOnly, ['en', 'vi'], ['vi'])).toThrow(/no caption/u);
    expect(() => shotLocales(templates, ['en', 'vi'], ['ja'])).toThrow(/no store listing/u);
  });
});
