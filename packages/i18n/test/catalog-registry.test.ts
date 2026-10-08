import { describe, expect, it } from 'vitest';

import { catalogRegistry } from '../src/catalog-registry/index';
import { catalogRegistry as appRegistry } from '../src/catalog-registry/index.native';
import { pseudoCatalogs as productionPseudo } from '../src/catalog-registry/mobile/no-pseudo';
import { locales, shippedLocaleCodes } from '../src/locales';

/** Catalogs only the web site and the services read; the app never shows them. */
const NOT_IN_APP = [
  'web',
  'driver-plan-web',
  'driver-claim/web',
  'server',
  'notifications/roundup',
];

describe('the app catalog registry', () => {
  it('registers the shipped locales, plus the pseudo-locale outside production', () => {
    const pseudo = locales.filter((entry) => entry.pseudo).map((entry) => entry.code);
    expect(Object.keys(appRegistry).sort()).toEqual([...shippedLocaleCodes, ...pseudo].sort());
    expect(productionPseudo).toEqual({});
  });

  it('leaves out every catalog only the web site or the services read', () => {
    for (const [locale, areas] of Object.entries(appRegistry)) {
      for (const name of NOT_IN_APP)
        expect({ locale, has: name in areas }).toEqual({ locale, has: false });
    }
  });

  it('keeps every other catalog of a shipped locale', () => {
    for (const locale of shippedLocaleCodes) {
      const expected = Object.keys(catalogRegistry[locale] ?? {}).filter(
        (name) => !NOT_IN_APP.includes(name),
      );
      expect(Object.keys(appRegistry[locale] ?? {})).toEqual(expected);
    }
  });
});
