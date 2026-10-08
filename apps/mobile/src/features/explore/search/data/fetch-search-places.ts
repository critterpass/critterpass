/**
 * The search screen's own read of `GET /v1/places/search`: it keeps the server's order (picks
 * before look-alikes, one row per place) and what the server knows about each place (its area,
 * its address, how far it is from the search's point), which the rows show as their second line.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and query keys, never copy. */
import { sessionHeaders } from '@/data/app-session/auth-client';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { withSearchTimeout, type FetchPlaces } from '@/data/places/server-name-search';

import type { Point, SearchPlace } from '../search-rows';

const SERVER_LIMIT = 50;

type Raw = Readonly<Record<string, unknown>>;
const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);

/** The api's places as search rows; a row with no id or name is left out. */
export function searchPlacesOf(body: unknown): SearchPlace[] {
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((raw: unknown): SearchPlace[] => {
    if (raw === null || typeof raw !== 'object') return [];
    const place = raw as Raw;
    const id = text(place['id']);
    const name = text(place['name']);
    if (id === null || name === null) return [];
    const tags = place['tags'];
    return [
      {
        id,
        poiId: id,
        name,
        nameLocal: text(place['nameLocal']),
        category: text(place['category']),
        lat: num(place['lat']),
        lng: num(place['lng']),
        tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string') : [],
        source: 'server',
        area: text(place['area']),
        address: text(place['address']),
        distanceM: num(place['distanceM']),
        recommended: place['recommended'] === true,
      },
    ];
  });
}

/** A fetcher for `useTripPlaceSearch` that measures from `near` when the search has a point. */
export function fetchSearchPlaces(near: Point | null): FetchPlaces {
  return ({ destinationId, q }, outer) =>
    withSearchTimeout(outer, async (signal) => {
      const params = new URLSearchParams({
        destination_id: destinationId,
        q,
        limit: String(SERVER_LIMIT),
      });
      if (near !== null) params.set('near', `${near.lat.toFixed(5)},${near.lng.toFixed(5)}`);
      const response = await fetch(`${resolveApiBaseUrl()}/v1/places/search?${params.toString()}`, {
        headers: { accept: 'application/json', ...(await sessionHeaders()) },
        signal,
      });
      if (!response.ok) throw new Error(`place search answered ${String(response.status)}`);
      return searchPlacesOf(await response.json());
    });
}
