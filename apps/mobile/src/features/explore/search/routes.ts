/**
 * The search screens' hrefs and their registrations: 7d-1 (the scoped field, which also shows
 * 7d-2, 7d-4 and 7i-2 as its states) and 7d-3 (add from a link).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and param keys, never copy. */
import type { Href } from 'expo-router';

import type { SearchScope } from './use-search-trip';

export interface SearchParams {
  readonly scope?: SearchScope | undefined;
  readonly dayId?: string | undefined;
  readonly poiId?: string | undefined;
  /** "lat,lng" of the map's centre (scope `map`). */
  readonly near?: string | undefined;
  /** A question to ask at once. */
  readonly q?: string | undefined;
}

const defined = (entries: Record<string, string | undefined>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(entries).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

export const searchRoutes = {
  search: (tripId: string, params: SearchParams = {}): Href => ({
    pathname: '/[tripId]/search',
    params: defined({
      tripId,
      scope: params.scope,
      day_id: params.dayId,
      poi_id: params.poiId,
      near: params.near,
      q: params.q,
    }),
  }),
  link: (tripId: string, source: { url: string } | { screenshot: true }): Href => ({
    pathname: '/[tripId]/search/link',
    params: 'url' in source ? { tripId, url: source.url } : { tripId, screenshot: '1' },
  }),
};

const SCOPES: readonly SearchScope[] = ['map', 'day', 'place', 'explore'];

export function scopeOf(value: string | undefined): SearchScope {
  return SCOPES.find((scope) => scope === value) ?? 'explore';
}
