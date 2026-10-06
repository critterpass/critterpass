/**
 * The add sheet's search (3c-10): places matching every keystroke (debounced 120 ms), from
 * `/v1/places/search` biased to the trip's destination, or, with no signal, from the destination's
 * browse kept on the phone, by the shared folded match (data/places). Each result carries its
 * pill, decided from what the api sends before a draft exists: a lottery or book-ahead tag, else
 * whether the place is open on any trip day (FITS, or CLASH when it is closed on all of them);
 * unknown hours carry no pill.
 */
/* eslint-disable lingui/no-unlocalized-strings -- dates, tags and wire values, never copy. */
import { shownName, WEEKDAYS, type Hours } from '@cp/domain';
import { useEffect, useState } from 'react';

import { dataOf } from '@/data/travel-data/freshness';
import { matchPlaces } from '@/data/places/match-places';

import type { SetupServices } from '../data/services';
import type { FitPill } from './model';
import { readBrowse, readerOf, readSearch, type CandidatePlace } from './places';

export const SEARCH_DEBOUNCE_MS = 120;
const LIMIT = 6;

export interface PlaceResult {
  readonly id: string;
  readonly name: string;
  readonly blurb: string | null;
  readonly pill: FitPill | null;
}

export type SearchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'done'; readonly results: readonly PlaceResult[]; readonly offline: boolean };

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let at = Date.parse(`${start}T00:00:00Z`); at <= Date.parse(`${end}T00:00:00Z`);) {
    dates.push(new Date(at).toISOString().slice(0, 10));
    at += 86_400_000;
  }
  return dates;
}

/** Open on at least one trip day; null when the hours or the dates are unknown. */
export function openOnDates(hours: Hours | null, dates: readonly string[]): boolean | null {
  if (hours === null || Object.keys(hours.weekly).length === 0 || dates.length === 0) return null;
  return dates.some((date) => {
    const exception = hours.exceptions?.find((entry) => entry.date === date);
    if (exception !== undefined) return exception.spans.length > 0;
    const weekday = WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7] ?? 'mo';
    return (hours.weekly[weekday] ?? []).length > 0;
  });
}

export function pillFor(
  tags: readonly string[],
  hours: Hours | null,
  dates: readonly string[],
): FitPill | null {
  if (tags.includes('lottery')) return { kind: 'lottery', closes: null };
  if (tags.some((tag) => tag === 'book_ahead' || tag.startsWith('book_ahead:'))) {
    return { kind: 'book_ahead', by: null };
  }
  const open = openOnDates(hours, dates);
  if (open === null) return null;
  return open ? { kind: 'fits', day: null } : { kind: 'clash' };
}

/** The browse's places matching `query`, by the shared folded match. */
export function matchBrowse(
  places: readonly CandidatePlace[],
  query: string,
): readonly CandidatePlace[] {
  const byId = new Map(places.map((place) => [place.id, place]));
  const candidates = places.map((place) => ({
    id: place.id,
    poiId: place.id,
    name: place.name,
    nameLocal: place.nameLocal,
    category: place.category,
    lat: null,
    lng: null,
    tags: [...place.tags],
    source: 'curated' as const,
  }));
  return matchPlaces(candidates, query, { limit: LIMIT }).flatMap((match) => {
    const place = byId.get(match.id);
    return place === undefined ? [] : [place];
  });
}

/** A result row: the reader's name, the note's line (else the address), and its pill. */
export function resultOf(
  place: CandidatePlace,
  dates: readonly string[],
  readsLocal: boolean,
): PlaceResult {
  return {
    id: place.id,
    name: shownName(place, readsLocal),
    blurb: place.whyGo ?? place.address,
    pill: pillFor(place.tags, place.hours, dates),
  };
}

/** Online: the api's search. Offline: the destination's kept browse, matched on the phone. */
export async function searchCandidates(
  services: SetupServices,
  destinationId: string | null,
  query: string,
): Promise<{ readonly places: readonly CandidatePlace[]; readonly offline: boolean }> {
  const reader = readerOf(services);
  const online = await readSearch(reader, query, destinationId, LIMIT);
  if (online !== null) return { places: online, offline: false };
  if (destinationId === null) return { places: [], offline: true };
  const kept = dataOf(await readBrowse(reader, destinationId))?.results ?? [];
  return { places: matchBrowse(kept, query), offline: true };
}

export function useMustDoSearch(options: {
  readonly services: SetupServices;
  readonly destinationId: string | null;
  readonly query: string;
  readonly dates: readonly string[];
  /** The reader sees places under their local names here (`@cp/domain` `readsLocalNames`). */
  readonly readsLocal?: boolean;
}): SearchState {
  const { services, destinationId } = options;
  const readsLocal = options.readsLocal === true;
  const query = options.query.trim();
  const dateKey = options.dates.join(',');
  const key = `${destinationId ?? ''}\u0000${query}\u0000${dateKey}\u0000${String(options.readsLocal === true)}`;
  const [found, setFound] = useState<{ readonly key: string; readonly state: SearchState } | null>(
    null,
  );
  useEffect(() => {
    if (query === '') return undefined;
    let live = true;
    const dates = dateKey === '' ? [] : dateKey.split(',');
    const timer = setTimeout(() => {
      void searchCandidates(services, destinationId, query)
        .then(({ places, offline }) => {
          const results = places.map((place) => resultOf(place, dates, readsLocal));
          if (live) setFound({ key, state: { kind: 'done', results, offline } });
        })
        .catch(() => {
          if (live) setFound({ key, state: { kind: 'done', results: [], offline: true } });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [services, destinationId, query, dateKey, key, readsLocal]);
  if (query === '') return { kind: 'idle' };
  if (found?.key === key) return found.state;
  // While the next keystroke's results load, keep the last ones on screen.
  return found?.state.kind === 'done' ? found.state : { kind: 'loading' };
}

export function tripDates(start: string | null, end: string | null): string[] {
  return start === null || end === null ? [] : datesBetween(start, end);
}
