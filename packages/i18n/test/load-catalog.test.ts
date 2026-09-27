import { describe, expect, it } from 'vitest';

import type { CatalogRegistry } from '../src/load-catalog';
import { loadAllCatalogs, loadCatalog } from '../src/load-catalog';

// A fake registry, not the generated `src/catalog-registry/`: that registry's entries import real
// compiled catalogs (`locales/<locale>/<area>.ts`), which only exist after `pnpm compile` has run.
// This package's own tests run before that step, so `loadCatalog`'s dispatch logic is tested with an
// injected registry instead of depending on build order.
const fixtureRegistry: CatalogRegistry = {
  en: {
    common: () => Promise.resolve({ 'common.retry.label': 'Try again' }),
    onboarding: () => Promise.resolve({ 'onboarding.welcome.title': 'Welcome' }),
  },
};

describe('loadCatalog', () => {
  it('resolves the loader registered for the locale and area', async () => {
    await expect(loadCatalog('en', 'common', fixtureRegistry)).resolves.toEqual({
      'common.retry.label': 'Try again',
    });
  });

  it('rejects for a registered locale with no matching area', async () => {
    await expect(loadCatalog('en', 'nonexistent', fixtureRegistry)).rejects.toThrow(
      /no compiled catalog registered/,
    );
  });

  it('rejects for an unregistered locale', async () => {
    await expect(loadCatalog('xx-XX', 'common', fixtureRegistry)).rejects.toThrow(
      /no compiled catalog registered/,
    );
  });
});

describe('loadAllCatalogs', () => {
  it('merges every registered area for a locale into one message map', async () => {
    await expect(loadAllCatalogs('en', fixtureRegistry)).resolves.toEqual({
      'common.retry.label': 'Try again',
      'onboarding.welcome.title': 'Welcome',
    });
  });

  it('resolves an empty object for an unregistered locale', async () => {
    await expect(loadAllCatalogs('xx-XX', fixtureRegistry)).resolves.toEqual({});
  });
});
