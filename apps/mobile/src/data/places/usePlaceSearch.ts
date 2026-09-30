/**
 * `/v1/places/search` with an offline fallback (`offlineSearch.ts`) when there is no network —
 * the "list view" / search box data source behind `CpMap` (T7a). Maps `@cp/domain`'s `PoiCategory`
 * taxonomy to the plain `iconKey`/`categoryLabel` strings `apps/mobile/src/ui/map` components take
 * (that layer may not depend on `@cp/domain` — tools/lint/boundaries.js — so this `mobile-data`
 * layer, which may, is where the mapping happens).
 *
 * The route needs the signed-in session, so every request carries the Better Auth cookie from
 * `sessionHeaders()`, as the app's other api reads do.
 */
import { CATEGORY_ICON_KEYS, poiCategorySchema, type PoiCategory } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useNetworkState } from 'expo-network';
import { useCallback, useEffect, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/auth-client';

import { resolveApiBaseUrl } from './apiBaseUrl';
import { getOfflineDb, searchPlacesOffline, type OfflinePlaceRecord } from './offlineSearch';

export interface SearchedPlace {
  readonly id: string;
  readonly name: string;
  readonly iconKey: string;
  readonly categoryLabel: string;
  readonly lat: number;
  readonly lng: number;
}

export interface UsePlaceSearchOptions {
  readonly destinationId?: string;
  readonly q?: string;
  readonly category?: PoiCategory;
  readonly near?: { readonly lat: number; readonly lng: number };
  readonly limit?: number;
  /** Forces the offline SQLite path regardless of the real network state — a real testability
   *  seam, not a shipped user-facing toggle: `setAirplaneMode` is a documented no-op on the iOS
   *  simulator Maestro runs on (Android-only in Maestro itself), so `e2e/explore/map-offline.yaml`
   *  needs a deterministic way to reach the offline branch instead of one this repo cannot yet
   *  automate on iOS. */
  readonly forceOffline?: boolean;
}

export interface UsePlaceSearchResult {
  readonly places: readonly SearchedPlace[];
  readonly loading: boolean;
  readonly error: string | null;
  /** Which path actually served the current `places` — surfaced so a screen can show "offline
   *  results" messaging rather than silently pretending it searched live. */
  readonly source: 'online' | 'offline' | 'none';
}

function categoryLabel(category: PoiCategory, t: ReturnType<typeof useLingui>['t']): string {
  const labels: Readonly<Record<PoiCategory, string>> = {
    temple_shrine: t({ id: 'places.category.templeShrine', message: 'Temple or shrine' }),
    food: t({ id: 'places.category.food', message: 'Food' }),
    market: t({ id: 'places.category.market', message: 'Market' }),
    nature: t({ id: 'places.category.nature', message: 'Nature' }),
    beach: t({ id: 'places.category.beach', message: 'Beach' }),
    museum: t({ id: 'places.category.museum', message: 'Museum' }),
    nightlife: t({ id: 'places.category.nightlife', message: 'Nightlife' }),
    shopping: t({ id: 'places.category.shopping', message: 'Shopping' }),
    transit: t({ id: 'places.category.transit', message: 'Transit' }),
    stay: t({ id: 'places.category.stay', message: 'Stay' }),
    health: t({ id: 'places.category.health', message: 'Health' }),
    other: t({ id: 'places.category.other', message: 'Place' }),
  };
  return labels[category];
}

interface RawSearchResult {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
}

/* eslint-disable lingui/no-unlocalized-strings -- query-param names, a URL path and header values
   below, never rendered as copy. */
async function fetchOnline(
  baseUrl: string,
  options: UsePlaceSearchOptions,
  t: ReturnType<typeof useLingui>['t'],
): Promise<SearchedPlace[]> {
  const params = new URLSearchParams();
  if (options.q !== undefined) params.set('q', options.q);
  if (options.destinationId !== undefined) params.set('destination_id', options.destinationId);
  if (options.category !== undefined) params.set('category', options.category);
  if (options.near !== undefined)
    params.set('near', `${String(options.near.lat)},${String(options.near.lng)}`);
  if (options.limit !== undefined) params.set('limit', String(options.limit));

  const response = await fetch(`${baseUrl}/v1/places/search?${params.toString()}`, {
    headers: { accept: 'application/json', ...(await sessionHeaders()) },
  });
  /* eslint-enable lingui/no-unlocalized-strings */
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new Error(body?.error?.message ?? body?.error?.code ?? `HTTP ${String(response.status)}`);
  }
  const body = (await response.json()) as { results: RawSearchResult[] };
  return body.results.map((result) => {
    const category = poiCategorySchema.parse(result.category);
    return {
      id: result.id,
      name: result.name,
      iconKey: CATEGORY_ICON_KEYS[category],
      categoryLabel: categoryLabel(category, t),
      lat: result.lat,
      lng: result.lng,
    };
  });
}

function fromOfflineRecord(record: OfflinePlaceRecord): SearchedPlace {
  return {
    id: record.id,
    name: record.name,
    iconKey: record.iconKey,
    categoryLabel: record.categoryLabel,
    lat: record.lat,
    lng: record.lng,
  };
}

export function usePlaceSearch(options: UsePlaceSearchOptions): UsePlaceSearchResult {
  const { t } = useLingui();
  const network = useNetworkState();
  const [places, setPlaces] = useState<readonly SearchedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'online' | 'offline' | 'none'>('none');

  const isOnline =
    !options.forceOffline && network.isConnected === true && network.isInternetReachable !== false;

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isOnline) {
        const results = await fetchOnline(resolveApiBaseUrl(), options, t);
        setPlaces(results);
        setSource('online');
        return;
      }
      if (options.destinationId === undefined) {
        setPlaces([]);
        setSource('none');
        return;
      }
      const db = await getOfflineDb();
      const results = await searchPlacesOffline(
        db,
        options.destinationId,
        options.q ?? '',
        options.limit,
      );
      setPlaces(results.map(fromOfflineRecord));
      setSource('offline');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPlaces([]);
      setSource('none');
    } finally {
      setLoading(false);
    }
    // `options` is a plain object recreated per render by callers; comparing its primitive fields
    // (not its identity) is what should actually re-trigger a search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOnline,
    options.q,
    options.destinationId,
    options.category,
    options.near?.lat,
    options.near?.lng,
    options.limit,
    t,
  ]);

  useEffect(() => {
    // `run` synchronizes React state with an external system (the network/offline SQLite) on
    // every dependency change — exactly this rule's own "Subscribe for updates from some external
    // system" case, just via a promise rather than a subscription callback; there is no
    // synchronous-loop risk here since `run` always awaits a real I/O boundary first.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    run().catch(() => {
      // `run` already records the failure in `error` state; nothing else to do with the rejection.
    });
  }, [run]);

  return { places, loading, error, source };
}
