/**
 * What a place page adds inside a trip (`/v1/places/{id}/context`): the walk from the stay, the
 * quiet window, who in the crew saved it or swiped yes, the crew's Q&A line, whether it is in the
 * plan and the slot ADD TO DAY suggests. The answer names crewmates and quotes the crew's chat, so
 * it is kept in memory only (never written to the phone) and is simply absent offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and wire values, never copy. */
import { placeContextSchema, type PlaceContextWire } from '@cp/domain';

import type { LastGoodCache } from '@/data/travel-data/client';
import type { ReadState } from '@/data/travel-data/freshness';
import { query, useTravelRead } from '@/data/travel-data/use-travel-read';

const answers = new Map<string, { savedAt: string; body: unknown }>();

/** Last answers for this run of the app only. */
const memoryCache: LastGoodCache = {
  get: (key) => answers.get(key),
  set: (key, body, savedAt) => {
    answers.set(key, { savedAt: savedAt.toISOString(), body });
  },
};

export function placeContextPath(
  poiId: string | null,
  tripId: string | null,
  date?: string,
): string | null {
  if (poiId === null || tripId === null) return null;
  return `/v1/places/${encodeURIComponent(poiId)}/context${query({ trip_id: tripId, date })}`;
}

export function usePlaceContext(
  poiId: string | null,
  tripId: string | null,
): ReadState<PlaceContextWire> {
  return useTravelRead({
    path: placeContextPath(poiId, tripId),
    schema: placeContextSchema,
    classify: () => ({ status: 'ok', seenAt: null }),
    cache: memoryCache,
  });
}
