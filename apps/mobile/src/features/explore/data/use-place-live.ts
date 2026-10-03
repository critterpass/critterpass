/**
 * The place's live Foursquare facts (`/v1/places/{id}/live`), read alongside the synced place and
 * never waited on. Foursquare allows no caching, so nothing is kept: no last good copy, no device
 * file, only the screen's own state while it is open. A 404 (an api without the route) reads as
 * missing, which shows nothing.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import type { LastGoodCache } from '@/data/travel-data/client';
import { dataOf } from '@/data/travel-data/freshness';
import { useTravelRead } from '@/data/travel-data/use-travel-read';

import { placeLiveParser, type PlaceLive } from '../place-live';

/** Keeps nothing: an offline page has no live facts. */
const noCache: LastGoodCache = {
  get: () => undefined,
  set: () => undefined,
};

export function placeLivePath(poiId: string | null): string | null {
  return poiId === null ? null : `/v1/places/${encodeURIComponent(poiId)}/live`;
}

export function usePlaceLive(poiId: string | null): PlaceLive | null {
  const read = useTravelRead({
    path: placeLivePath(poiId),
    schema: placeLiveParser,
    classify: () => ({ status: 'ok', seenAt: null }),
    cache: noCache,
  });
  return dataOf(read) ?? null;
}
