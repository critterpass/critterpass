/**
 * Writes `apps/mobile/store.config.json` (EAS metadata for App Store Connect) from the validated
 * listings in `@cp/content/store`. `eas metadata:push` uploads it; `--check` fails when the
 * committed file is out of date.
 *
 *   pnpm tsx tools/scripts/store-kit/metadata.ts [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { STORE_LOCALES, STORE_URLS, storeListings, type Listing } from '@cp/content/store';
import type { AppLocale } from '@cp/domain';

const OUT = fileURLToPath(new URL('../../../apps/mobile/store.config.json', import.meta.url));

export function appleInfo(listing: Listing) {
  const a = listing.appStore;
  return {
    title: a.name,
    subtitle: a.subtitle,
    description: a.description,
    keywords: a.keywords,
    releaseNotes: a.releaseNotes,
    promoText: a.promoText,
    marketingUrl: STORE_URLS.marketing,
    supportUrl: STORE_URLS.support,
    privacyPolicyUrl: STORE_URLS.privacy,
  };
}

export function easMetadata(listings: Partial<Record<AppLocale, Listing>>, year: number) {
  const info: Record<string, ReturnType<typeof appleInfo>> = {};
  for (const [locale, listing] of Object.entries(listings) as [AppLocale, Listing][]) {
    info[STORE_LOCALES[locale].appStore] = appleInfo(listing);
  }
  return {
    configVersion: 0,
    apple: {
      copyright: `${year} CritterPass`,
      categories: ['TRAVEL', 'SOCIAL_NETWORKING'],
      // An approved version waits for a manual release, then reaches people in phases over seven
      // days, so a bad build can be paused before everyone has it. The release workflow refuses
      // an iOS submission without `phasedRelease`.
      release: { automaticRelease: false, phasedRelease: true },
      info,
    },
  };
}

function main(): void {
  const metadata = easMetadata(storeListings(), 2026);
  if (process.argv.includes('--check')) {
    // Compared as data: prettier owns the file's formatting.
    const current = JSON.stringify(JSON.parse(readFileSync(OUT, 'utf8')));
    if (current !== JSON.stringify(metadata)) {
      console.error('apps/mobile/store.config.json is out of date: run store-kit/metadata.ts');
      process.exitCode = 1;
    }
    return;
  }
  writeFileSync(OUT, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`wrote ${OUT}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
