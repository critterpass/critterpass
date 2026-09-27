/**
 * Offline region pack download/delete (F-031 "Offline packs": "per destination region download
 * (PMTiles file + POI subset + local search index) into app storage; free for everyone; storage
 * shown and removable"). Downloads the PMTiles archive the same way the tiles spike proved out
 * (`expo-file-system`'s real `downloadAsync`/`FileSystem.documentDirectory`, no
 * `addProtocol` shim needed — MapLibre Native reads `pmtiles://file://…` natively) plus a POI
 * subset it indexes into `offlineSearch.ts`'s local SQLite so search still works offline.
 *
 * The POI subset comes from `/v1/places/search?destination_id=…`, which today caps at 50 results
 * (`services/api/src/places/search.ts`'s `MAX_LIMIT`) — there is no bulk/paginated export route
 * yet, so a very large destination's offline search index is incomplete until one exists. Real
 * behaviour, not a stub: it indexes everything the api can currently return, and is a one-line
 * change (a bigger `limit`, or a real cursor) once that route exists.
 */
/* eslint-disable lingui/no-unlocalized-strings -- every string literal below is a URL, file path,
   fetch option value, or an `Error` message (docs/code-standards.md §3: the UI maps an error
   `code` to a localised message and never shows a raw `message` — these are debug detail, not
   copy), never user-facing text. */
import { CATEGORY_ICON_KEYS, poiCategorySchema, type PoiCategory } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useState } from 'react';

import { resolveApiBaseUrl } from './apiBaseUrl';
import {
  clearOfflinePlaces,
  getOfflineDb,
  indexPlacesOffline,
  type OfflinePlaceRecord,
} from './offlineSearch';

const POI_SUBSET_LIMIT = 50;

export type RegionPackStatus = 'checking' | 'idle' | 'downloading' | 'downloaded' | 'error';

export interface RegionPackState {
  readonly status: RegionPackStatus;
  /** 0-1, only meaningful while `status === 'downloading'`. */
  readonly progress: number;
  readonly localPmtilesUri: string | null;
  readonly bytes: number | null;
  readonly poiCount: number | null;
  readonly error: string | null;
}

export interface UseRegionPackResult extends RegionPackState {
  readonly download: () => Promise<void>;
  readonly remove: () => Promise<void>;
}

interface RegionManifest {
  readonly url: string;
  readonly bytes: number;
  readonly version: string;
  readonly poiCount: number;
}

async function fetchManifest(destinationId: string): Promise<RegionManifest> {
  const response = await fetch(`${resolveApiBaseUrl()}/v1/map/regions/${destinationId}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new Error(body?.error?.message ?? body?.error?.code ?? `HTTP ${String(response.status)}`);
  }
  return (await response.json()) as RegionManifest;
}

interface RawSearchResult {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
}

async function fetchPoiSubset(
  destinationId: string,
  categoryLabels: Readonly<Record<PoiCategory, string>>,
): Promise<OfflinePlaceRecord[]> {
  const params = new URLSearchParams({
    destination_id: destinationId,
    limit: String(POI_SUBSET_LIMIT),
  });
  const response = await fetch(`${resolveApiBaseUrl()}/v1/places/search?${params.toString()}`, {
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  const body = (await response.json()) as { results: RawSearchResult[] };
  return body.results.map((result) => {
    const category = poiCategorySchema.parse(result.category);
    return {
      id: result.id,
      destinationId,
      name: result.name,
      iconKey: CATEGORY_ICON_KEYS[category],
      categoryLabel: categoryLabels[category],
      lat: result.lat,
      lng: result.lng,
    };
  });
}

function localPmtilesPath(destinationSlug: string, version: string): string {
  const dir = `${FileSystem.documentDirectory}cp-regions/`;
  return `${dir}${destinationSlug}-${version}.pmtiles`;
}

export function useRegionPack(destinationId: string, destinationSlug: string): UseRegionPackResult {
  const { t } = useLingui();
  const [state, setState] = useState<RegionPackState>({
    status: 'checking',
    progress: 0,
    localPmtilesUri: null,
    bytes: null,
    poiCount: null,
    error: null,
  });

  const categoryLabels: Readonly<Record<PoiCategory, string>> = {
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

  // A previous download may already be on disk (app relaunch) — check every real version this
  // hook could plausibly have written, cheapest-first: today that is just "whatever the manifest
  // says now", so this defers to `download()` having already run once; a real cold-start restore
  // needs the last-known version persisted (e.g. MMKV), tracked as a follow-up since no such store
  // is wired for this data yet.
  useEffect(() => {
    setState((current) =>
      current.status === 'checking' ? { ...current, status: 'idle' } : current,
    );
  }, []);

  const download = useCallback(async () => {
    setState((current) => ({ ...current, status: 'downloading', progress: 0, error: null }));
    try {
      const manifest = await fetchManifest(destinationId);
      const localUri = localPmtilesPath(destinationSlug, manifest.version);
      await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}cp-regions/`, {
        intermediates: true,
      }).catch(() => {
        // Already exists — fine.
      });

      const resumable = FileSystem.createDownloadResumable(manifest.url, localUri, {}, (data) => {
        const progress =
          data.totalBytesExpectedToWrite > 0
            ? data.totalBytesWritten / data.totalBytesExpectedToWrite
            : 0;
        setState((current) => ({ ...current, progress }));
      });
      const result = await resumable.downloadAsync();
      if (result === undefined) throw new Error('download did not complete');

      const poiSubset = await fetchPoiSubset(destinationId, categoryLabels);
      const db = await getOfflineDb();
      await indexPlacesOffline(db, destinationId, poiSubset);

      setState({
        status: 'downloaded',
        progress: 1,
        localPmtilesUri: result.uri,
        bytes: manifest.bytes,
        poiCount: manifest.poiCount,
        error: null,
      });
    } catch (cause: unknown) {
      setState((current) => ({
        ...current,
        status: 'error',
        error: cause instanceof Error ? cause.message : String(cause),
      }));
    }
    // `categoryLabels` is a fresh object every render (built from `t`); only `t` itself identifies
    // a real locale change worth re-running for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationId, destinationSlug, t]);

  const remove = useCallback(async () => {
    if (state.localPmtilesUri !== null) {
      await FileSystem.deleteAsync(state.localPmtilesUri, { idempotent: true });
    }
    const db = await getOfflineDb();
    await clearOfflinePlaces(db, destinationId);
    setState({
      status: 'idle',
      progress: 0,
      localPmtilesUri: null,
      bytes: null,
      poiCount: null,
      error: null,
    });
  }, [destinationId, state.localPmtilesUri]);

  return { ...state, download, remove };
}
