/**
 * The add sheet's place search over the trip destination's places on the phone. Names are folded
 * (accents, đ, case) before matching, so a traveller's keyboard spelling finds the local one: "My
 * Son" finds "Mỹ Sơn Sanctuary", "ngu hanh" finds "Ngũ Hành Sơn". Every word must match the name or
 * the local name; names that start with the query come first.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Sentry tags, never copy. */
import * as Sentry from '@sentry/react-native';
import { useEffect, useMemo } from 'react';

import { useLiveRows } from './live-rows';
import { DESTINATION_PLACES_SQL, PLACES_TABLES, type PlaceRow } from './queries';

export interface PlaceSearch {
  readonly rows: readonly PlaceRow[];
  readonly loaded: boolean;
  readonly failed: boolean;
  /**
   * None of the destination's places are on the phone yet (its place pack is still syncing), so an
   * empty result says nothing about the query.
   */
  readonly arriving: boolean;
  /** Runs the search again after it failed. */
  readonly retry: () => void;
}

interface PlaceCandidate extends PlaceRow {
  readonly name_local: string | null;
}

const LIMIT = 20;

export function foldPlaceText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The places matching `query`, best first (pure, for the hook and its tests). */
export function matchPlaces(places: readonly PlaceCandidate[], query: string): PlaceRow[] {
  const q = foldPlaceText(query);
  if (q === '') return [];
  const words = q.split(' ');
  const scored = places.flatMap((place) => {
    const name = foldPlaceText(place.name);
    const local = foldPlaceText(place.name_local ?? '');
    const both = `${name} ${local}`;
    if (!words.every((word) => both.includes(word))) return [];
    const rank = name.startsWith(q) || local.startsWith(q) ? 0 : both.includes(q) ? 1 : 2;
    return [{ place, rank }];
  });
  return scored
    .sort((a, b) => a.rank - b.rank || a.place.name.localeCompare(b.place.name))
    .slice(0, LIMIT)
    .map(({ place }) => ({
      id: place.id,
      name: place.name,
      category: place.category,
      lat: place.lat,
      lng: place.lng,
    }));
}

/** Reports a failed read of the phone's places (Sentry, the app's error reporting). */
export function reportPlaceSearchFailure(error: unknown): void {
  Sentry.captureException(error, { tags: { area: 'plan.add_place_search' } });
}

export function usePlaceSearch(
  destinationId: string | null,
  query: string,
  report: (error: unknown) => void = reportPlaceSearchFailure,
): PlaceSearch {
  const places = useLiveRows<PlaceCandidate>(
    DESTINATION_PLACES_SQL,
    destinationId === null ? null : [destinationId],
    PLACES_TABLES,
  );
  const rows = useMemo(() => matchPlaces(places.rows, query), [places.rows, query]);
  // A failed read of the phone's places is reported, never shown as "nothing found".
  useEffect(() => {
    if (places.failed !== true) return;
    report(places.error);
  }, [places.failed, places.error, report]);
  const retry = places.retry ?? (() => undefined);
  // Without a destination there is nothing to search: answered at once, with nothing found.
  if (destinationId === null) {
    return { rows: [], loaded: true, failed: false, arriving: false, retry };
  }
  return {
    rows,
    loaded: places.loaded,
    failed: places.failed === true,
    arriving: places.loaded && places.failed !== true && places.rows.length === 0,
    retry,
  };
}
