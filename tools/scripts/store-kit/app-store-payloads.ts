/**
 * App Store Connect API request bodies for Custom Product Pages and In-App Events, built from the
 * validated listings. `cpp.ts` and `events.ts` print them (dry run) until the production app
 * record exists; the founder creates the pages and events from these in App Store Connect.
 */
import { STORE_LOCALES, type Listing } from '@cp/content/store';
import type { AppLocale } from '@cp/domain';

const BADGES: Readonly<Record<Listing['inAppEvents'][number]['badge'], string>> = {
  challenge: 'CHALLENGE',
  competition: 'COMPETITION',
  'live-event': 'LIVE_EVENT',
  'major-update': 'MAJOR_UPDATE',
  'new-season': 'NEW_SEASON',
  premiere: 'PREMIERE',
  'special-event': 'SPECIAL_EVENT',
};

const PURPOSE = { all: 'APPROPRIATE_FOR_ALL_USERS', new: 'ATTRACT_NEW_USERS' } as const;

type Listings = Partial<Record<AppLocale, Listing>>;

function english(listings: Listings): Listing {
  const en = listings.en;
  if (!en) throw new Error('the English listing is required');
  return en;
}

export function customProductPages(listings: Listings, appId: string) {
  return english(listings).customProductPages.map((page) => ({
    page: {
      type: 'appCustomProductPages',
      attributes: { name: page.referenceName },
      relationships: { app: { data: { type: 'apps', id: appId } } },
    },
    version: { type: 'appCustomProductPageVersions', attributes: { deepLink: page.deepLink } },
    localizations: (Object.entries(listings) as [AppLocale, Listing][]).flatMap(([locale, l]) => {
      const localized = l.customProductPages.find((p) => p.id === page.id);
      return localized
        ? [
            {
              type: 'appCustomProductPageLocalizations',
              attributes: {
                locale: STORE_LOCALES[locale].appStore,
                promotionalText: localized.promoText,
              },
            },
          ]
        : [];
    }),
    keywords: page.keywords ?? [],
  }));
}

export function inAppEvents(listings: Listings, appId: string) {
  return english(listings).inAppEvents.map((event) => ({
    event: {
      type: 'appEvents',
      attributes: {
        referenceName: event.referenceName,
        badge: BADGES[event.badge],
        deepLink: event.deepLink,
        purpose: PURPOSE[event.audience],
        primaryLocale: STORE_LOCALES.en.appStore,
        purchaseRequirement: 'NO_COST_ASSOCIATED',
      },
      relationships: { app: { data: { type: 'apps', id: appId } } },
    },
    localizations: (Object.entries(listings) as [AppLocale, Listing][]).flatMap(([locale, l]) => {
      const localized = l.inAppEvents.find((e) => e.id === event.id);
      return localized
        ? [
            {
              type: 'appEventLocalizations',
              attributes: {
                locale: STORE_LOCALES[locale].appStore,
                name: localized.name,
                shortDescription: localized.shortDescription,
                longDescription: localized.longDescription,
              },
            },
          ]
        : [];
    }),
  }));
}
