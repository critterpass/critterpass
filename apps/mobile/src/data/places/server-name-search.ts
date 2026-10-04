/**
 * Name search over every place of the destination on the api (`GET /v1/places/search`): the phone
 * carries only the destination's curated places and the crew's ideas, while open-data places (Mỹ
 * Sơn's sanctuary among them) are searched on the server. Debounced, the latest query wins, offline
 * it does not run at all, and a failure is reported to the caller.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and query keys, never copy. */
import { useEffect, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/auth-client';
import { useLocalFirst } from '@/data/powersync/local-first-context';

import { resolveApiBaseUrl } from './apiBaseUrl';
import { foldWords } from './fold';
import type { PlaceCandidate } from './match-places';

export const SERVER_SEARCH_DEBOUNCE_MS = 250;
// The most the api gives; its rows are re-ranked here so places named after the query come first.
const SERVER_LIMIT = 50;

export type FetchPlaces = (
  input: { readonly destinationId: string; readonly q: string },
  signal: AbortSignal,
) => Promise<PlaceCandidate[]>;

interface RawPlace {
  readonly id: string;
  readonly name: string;
  readonly nameLocal?: string | null;
  readonly category: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly tags?: readonly string[] | null;
}

/** An api place as a search row. */
export function serverPlace(place: RawPlace): PlaceCandidate {
  return {
    id: place.id,
    poiId: place.id,
    name: place.name,
    nameLocal: place.nameLocal ?? null,
    category: place.category ?? null,
    lat: place.lat ?? null,
    lng: place.lng ?? null,
    tags: place.tags ?? [],
    source: 'server',
  };
}

export const fetchPlacesOnline: FetchPlaces = async ({ destinationId, q }, signal) => {
  const params = new URLSearchParams({
    destination_id: destinationId,
    q,
    limit: String(SERVER_LIMIT),
  });
  const response = await fetch(`${resolveApiBaseUrl()}/v1/places/search?${params.toString()}`, {
    headers: { accept: 'application/json', ...(await sessionHeaders()) },
    signal,
  });
  if (!response.ok) throw new Error(`place search answered ${String(response.status)}`);
  const body = (await response.json()) as { results?: RawPlace[] };
  return rankByName((body.results ?? []).map(serverPlace), q);
};

/**
 * Places whose name or local name has a word starting with each typed word first, the rest after
 * in the api's own order: the api also matches by address and tags, so "My Son" brings every bar in
 * Mỹ An, Sơn Trà along with the sanctuary.
 */
export function rankByName<T extends { readonly name: string; readonly nameLocal?: string | null }>(
  places: readonly T[],
  query: string,
): T[] {
  const words = foldWords(query);
  const named = (place: T) => {
    const tokens = foldWords(`${place.name} ${place.nameLocal ?? ''}`);
    return words.every((word) => tokens.some((token) => token.startsWith(word)));
  };
  return [...places.filter(named), ...places.filter((place) => !named(place))];
}

export type ServerSearchStatus = 'idle' | 'offline' | 'loading' | 'ready' | 'failed';

export interface ServerPlaceSearch {
  readonly status: ServerSearchStatus;
  readonly rows: readonly PlaceCandidate[];
  readonly error?: unknown;
}

/** Whether the phone has a connection now, following changes. */
export function useOnline(): boolean {
  const { network } = useLocalFirst();
  const [online, setOnline] = useState(() => network.isOnline());
  useEffect(() => network.subscribe(setOnline), [network]);
  return online;
}

export function useServerPlaceSearch(
  destinationId: string | null,
  query: string,
  fetchPlaces: FetchPlaces = fetchPlacesOnline,
): ServerPlaceSearch & { readonly retry: () => void } {
  const online = useOnline();
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);
  const q = query.trim();
  const key = destinationId === null || q === '' ? null : `${destinationId}\u0000${q}`;
  const [answer, setAnswer] = useState<{ key: string; result: ServerPlaceSearch } | null>(null);
  useEffect(() => {
    if (key === null || destinationId === null || !online) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setAnswer((prev) => (prev?.key === key && prev.result.status === 'failed' ? null : prev));
      fetchPlaces({ destinationId, q }, controller.signal).then(
        (rows) => {
          if (!controller.signal.aborted) setAnswer({ key, result: { status: 'ready', rows } });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setAnswer({ key, result: { status: 'failed', rows: [], error } });
          }
        },
      );
    }, SERVER_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, destinationId, q, online, fetchPlaces, attempt]);
  if (key === null) return { status: 'idle', rows: [], retry };
  if (!online) return { status: 'offline', rows: [], retry };
  return answer !== null && answer.key === key
    ? { ...answer.result, retry }
    : { status: 'loading', rows: [], retry };
}

/** The phone's rows first, then the server's places that are not already listed. */
export function mergePlaceRows(
  local: readonly PlaceCandidate[],
  server: readonly PlaceCandidate[],
  limit = 30,
): PlaceCandidate[] {
  const seen = new Set(local.map((row) => row.poiId ?? row.id));
  return [...local, ...server.filter((row) => !seen.has(row.poiId ?? row.id))].slice(0, limit);
}

export type SearchState = 'searching' | 'arriving' | 'none' | 'failed' | 'results';

/**
 * What a search box says under a search, from the phone's search and the server's:
 * - rows from either → `results` (with `more` while the server is still answering);
 * - both failed, or the phone failed and the server cannot be reached → `failed`;
 * - the server answered with nothing, or offline the phone's synced places have nothing → `none`;
 * - offline while the trip's places are still landing → `arriving`;
 * - otherwise still `searching`.
 */
export function searchState(input: {
  readonly rows: number;
  readonly local: {
    readonly loaded: boolean;
    readonly failed: boolean;
    readonly arriving: boolean;
  };
  readonly server: ServerSearchStatus;
}): { readonly state: SearchState; readonly more: boolean } {
  const { rows, local, server } = input;
  const serverDown = server === 'failed' || server === 'offline';
  if (rows > 0) return { state: 'results', more: server === 'loading' };
  if (local.failed && serverDown) return { state: 'failed', more: false };
  if (server === 'ready') return { state: 'none', more: false };
  if (serverDown && local.loaded && !local.failed) {
    return { state: local.arriving ? 'arriving' : 'none', more: false };
  }
  return { state: 'searching', more: false };
}
