/**
 * The one place search every search box uses: the crew's ideas and the destination's curated
 * places on the phone first (folded, so "cafe" finds "Café"), then the server's open-data places
 * that are not already listed. Offline it is the phone alone, by name and kind of place, and it
 * says how much it searched: the trip's saved places and the curated places on the phone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and Sentry tags, never copy. */
import * as Sentry from '@sentry/react-native';
import { useEffect, useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

import { matchPlaces, type PlaceCandidate } from './match-places';
import {
  fetchPlacesOnline,
  mergePlaceRows,
  searchState,
  useServerPlaceSearch,
  type FetchPlaces,
  type SearchState,
} from './server-name-search';
import { useTripPackSynced } from './trip-pack';

export const CURATED_PLACES_SQL = `SELECT id, name, name_local, category, lat, lng, tags, hours
  FROM pois WHERE destination_id = ? AND status = 'active' AND merged_into_id IS NULL`;
export const SAVED_IDEAS_SQL = `SELECT id, poi_id, name, name_local, category, lat, lng
  FROM trip_ideas WHERE trip_id = ? AND deleted_at IS NULL`;

interface CuratedRow {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly tags: string | null;
  readonly hours: string | null;
}

interface IdeaRow {
  readonly id: string;
  readonly poi_id: string | null;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

/** A synced text array: JSON (`["coffee"]`) or a Postgres literal (`{coffee}`). */
export function tagList(raw: string | null): string[] {
  if (raw === null || raw === '') return [];
  if (raw.startsWith('{')) {
    return raw
      .replace(/^\{|\}$/gu, '')
      .split(',')
      .map((tag) => tag.replace(/"/gu, '').trim())
      .filter((tag) => tag !== '');
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === 'string') : [];
  } catch {
    return [];
  }
}

export function curatedCandidate(row: CuratedRow): PlaceCandidate {
  return {
    id: row.id,
    poiId: row.id,
    name: row.name,
    nameLocal: row.name_local,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
    tags: tagList(row.tags),
    source: 'curated',
  };
}

export function ideaCandidate(row: IdeaRow): PlaceCandidate {
  return {
    id: row.id,
    poiId: row.poi_id,
    name: row.name,
    nameLocal: row.name_local,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
    tags: [],
    source: 'idea',
  };
}

export interface TripPlaceSearch {
  readonly rows: readonly PlaceCandidate[];
  readonly state: SearchState;
  /** The server is still answering under the phone's rows. */
  readonly more: boolean;
  /** The server did not answer: the rows are only what this phone holds. */
  readonly incomplete: boolean;
  /** Only the phone answered (no connection). */
  readonly offline: boolean;
  /** What the phone searched: the trip's saved places and the curated places on the phone. */
  readonly counts: { readonly saved: number; readonly curated: number };
  /** Synced weekly hours (JSON text) by place id, for "open, as of". */
  readonly hours: ReadonlyMap<string, string>;
  readonly retry: () => void;
}

export interface TripPlaceSearchInput {
  readonly destinationId: string | null;
  readonly tripId: string | null;
  readonly query: string;
  readonly near?: { readonly lat: number; readonly lng: number } | null;
  readonly fetchPlaces?: FetchPlaces;
  readonly report?: (error: unknown) => void;
}

function reportFailure(error: unknown): void {
  Sentry.captureException(error, { tags: { area: 'places.search' } });
}

export function useTripPlaceSearch(input: TripPlaceSearchInput): TripPlaceSearch {
  const { destinationId, tripId, query } = input;
  const report = input.report ?? reportFailure;
  const packSynced = useTripPackSynced(tripId);
  const curated = useLiveRows<CuratedRow>(
    CURATED_PLACES_SQL,
    destinationId === null ? null : [destinationId],
    ['pois'],
  );
  const ideas = useLiveRows<IdeaRow>(SAVED_IDEAS_SQL, tripId === null ? null : [tripId], [
    'trip_ideas',
  ]);
  const candidates = useMemo(
    () => [...ideas.rows.map(ideaCandidate), ...curated.rows.map(curatedCandidate)],
    [ideas.rows, curated.rows],
  );
  const near = input.near ?? null;
  const local = useMemo(() => matchPlaces(candidates, query, { near }), [candidates, query, near]);
  const hours = useMemo(
    () =>
      new Map(
        curated.rows.flatMap((row) => (row.hours === null ? [] : [[row.id, row.hours] as const])),
      ),
    [curated.rows],
  );
  const server = useServerPlaceSearch(destinationId, query, input.fetchPlaces ?? fetchPlacesOnline);
  const failed = curated.failed === true;
  useEffect(() => {
    if (failed) report(curated.error);
  }, [failed, curated.error, report]);
  const rows = mergePlaceRows(local, server.rows);
  const loaded = curated.loaded && (tripId === null || ideas.loaded);
  const arriving = !failed && (!packSynced || (curated.loaded && curated.rows.length === 0));
  const { state, more, incomplete } = searchState({
    rows: rows.length,
    local: { loaded: destinationId === null || loaded, failed, arriving },
    server: server.status,
  });
  return {
    rows,
    state: query.trim() === '' ? 'searching' : state,
    more,
    incomplete,
    offline: server.status === 'offline',
    counts: { saved: ideas.rows.length, curated: curated.rows.length },
    hours,
    retry: () => {
      curated.retry?.();
      ideas.retry?.();
      server.retry();
    },
  };
}
