import { describe, expect, it } from 'vitest';

import en from './listing/en.json' with { type: 'json' };
import { listingSchema, storeListings } from './index';

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
});
