/**
 * "More places" under a search's own results: when the phone and our server find fewer than five
 * places for what was typed, the api's live Foursquare search (`/v1/places/search/live`) is asked
 * once the typing settles. Foursquare's terms let nothing it returns be kept, so these results live
 * in this hook's state only (never the local database, never a cache) and go with the screen.
 *
 * A pick asks `/v1/places/search/live/resolve` for the open-data place behind it: `ready` gives our
 * own POI (its name, not Foursquare's), `loading` means the destination's places are still being
 * gathered, and `unavailable` means the place can be seen here but not saved.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and wire values, never copy. */
import { useEffect, useState } from 'react';

/** An api read: the parsed body, a wire error, or no answer at all (offline, timeout). */
export type PlaceApiRead =
  | { readonly kind: 'ok'; readonly body: unknown }
  | { readonly kind: 'error'; readonly status: number; readonly code: string }
  | { readonly kind: 'offline' };

export type GetPlaceJson = (path: string) => Promise<PlaceApiRead>;

/** Typing has to rest this long before a live search is spent on it. */
export const MORE_PLACES_DEBOUNCE_MS = 700;
const WEAK_RESULT_COUNT = 5;
const MIN_QUERY_LENGTH = 3;

export interface LivePlace {
  readonly fsqPlaceId: string;
  readonly poiId: string | null;
  readonly name: string;
  readonly address: string | null;
}

export type MorePlacesState =
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'done'; readonly places: readonly LivePlace[] };

export type LivePick =
  | { readonly kind: 'ready'; readonly poiId: string; readonly name: string }
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'offline' };

function livePlaces(body: unknown): LivePlace[] {
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((raw: unknown) => {
    const place = raw as Partial<Record<keyof LivePlace, unknown>>;
    if (typeof place.fsqPlaceId !== 'string' || typeof place.name !== 'string') return [];
    return [
      {
        fsqPlaceId: place.fsqPlaceId,
        poiId: typeof place.poiId === 'string' ? place.poiId : null,
        name: place.name,
        address: typeof place.address === 'string' ? place.address : null,
      },
    ];
  });
}

/** Whether our own finished, online results leave room for a live search. */
export function wantsLivePlaces(query: string, results: number | null, offline: boolean): boolean {
  return (
    query.trim().length >= MIN_QUERY_LENGTH &&
    results !== null &&
    !offline &&
    results < WEAK_RESULT_COUNT
  );
}

export function useLivePlaces(options: {
  readonly getJson: GetPlaceJson;
  readonly destinationId: string | null;
  readonly query: string;
  /** From `wantsLivePlaces`. */
  readonly wanted: boolean;
}): MorePlacesState {
  const { getJson, destinationId } = options;
  const query = options.query.trim();
  const wanted = destinationId !== null && options.wanted;
  const key = `${destinationId ?? ''}\u0000${query}`;
  const [found, setFound] = useState<{ readonly key: string; readonly places: LivePlace[] } | null>(
    null,
  );
  useEffect(() => {
    if (!wanted || destinationId === null) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, destination_id: destinationId });
      void getJson(`/v1/places/search/live?${params.toString()}`).then((read) => {
        if (live) setFound({ key, places: read.kind === 'ok' ? livePlaces(read.body) : [] });
      });
    }, MORE_PLACES_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [getJson, destinationId, query, key, wanted]);
  if (!wanted) return { kind: 'none' };
  if (found?.key === key) return { kind: 'done', places: found.places };
  return { kind: 'loading' };
}

/** Asks the api for the storable place behind a live result. */
export async function resolveLivePlace(
  getJson: GetPlaceJson,
  destinationId: string,
  place: LivePlace,
): Promise<LivePick> {
  const params = new URLSearchParams({
    fsq_place_id: place.fsqPlaceId,
    destination_id: destinationId,
  });
  const read = await getJson(`/v1/places/search/live/resolve?${params.toString()}`);
  if (read.kind === 'offline') return { kind: 'offline' };
  if (read.kind === 'error') return { kind: 'unavailable' };
  const body = read.body as { status?: unknown; poiId?: unknown; name?: unknown } | null;
  if (body?.status === 'ready' && typeof body.poiId === 'string' && typeof body.name === 'string') {
    return { kind: 'ready', poiId: body.poiId, name: body.name };
  }
  return body?.status === 'loading' ? { kind: 'loading' } : { kind: 'unavailable' };
}
