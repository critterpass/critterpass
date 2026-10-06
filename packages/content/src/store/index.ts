/**
 * Every store listing in `listing/`, validated. A language without its own file is not uploaded;
 * the stores fall back to the English listing.
 */
import type { AppLocale } from '@cp/domain';

import en from './listing/en.json' with { type: 'json' };
import vi from './listing/vi.json' with { type: 'json' };
import { listingSchema, type Listing } from './schema';

const RAW: Partial<Record<AppLocale, unknown>> = { en, vi };

/** Parses every listing; throws with the locale and the field when copy breaks a store limit. */
export function storeListings(): Partial<Record<AppLocale, Listing>> {
  const out: Partial<Record<AppLocale, Listing>> = {};
  for (const [locale, raw] of Object.entries(RAW) as [AppLocale, unknown][]) {
    const parsed = listingSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      throw new Error(`store listing ${locale} is invalid:\n- ${issues.join('\n- ')}`);
    }
    out[locale] = parsed.data;
  }
  return out;
}

export * from './schema';
export * from './templates';
