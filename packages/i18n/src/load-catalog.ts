import type { Messages } from '@lingui/core';

import { catalogRegistry } from './catalog-registry/index.js';

export type CatalogRegistry = Record<string, Record<string, () => Promise<Messages>>>;

/**
 * Loads one area's compiled catalog for one locale from the generated registry
 * (`src/catalog-registry/`, see its generator for why a registry rather than a plain dynamic
 * `import()` with the locale and area interpolated in): every bundler this package runs under
 * needs a literal string per `import()` call, so the registry pre-enumerates them.
 */
export function loadCatalog(
  locale: string,
  area: string,
  registry: CatalogRegistry = catalogRegistry,
): Promise<Messages> {
  const loader = registry[locale]?.[area];
  if (!loader) {
    return Promise.reject(
      new Error(`no compiled catalog registered for locale "${locale}", area "${area}"`),
    );
  }
  return loader();
}

/**
 * Loads every catalog registered for a locale and merges them into one message map. The mobile app
 * bundles every area for the active locale up front rather than lazily per screen; ids are unique
 * per the `area.screen.element` convention, so merging never overwrites one area's message with
 * another's.
 */
export async function loadAllCatalogs(
  locale: string,
  registry: CatalogRegistry = catalogRegistry,
): Promise<Messages> {
  const loaders = Object.values(registry[locale] ?? {});
  const catalogs = await Promise.all(loaders.map((load) => load()));
  return catalogs.reduce<Messages>((merged, catalog) => ({ ...merged, ...catalog }), {});
}
