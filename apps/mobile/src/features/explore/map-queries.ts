/**
 * The Explore map's reads: a destination's places, which are the ones the phone holds (the trip's
 * own cards, a browsed destination's curated set) and the api's browse (`GET /v1/places/search`
 * with no query, recommended first), so an open-data place the phone never synced still shows.
 * The browse keeps its last good copy, so offline the map shows what it showed last. Also which
 * places are in the trip's plan with their day and start.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, route paths and wire keys, never copy. */
import { shownPlaceName } from '@cp/domain';
import { useEffect, useMemo, useState } from 'react';

import { editorialFor } from '@/data/places/editorial-note';
import {
  createLastGoodCache,
  readThrough,
  useTravelDataReader,
  type LastGoodCache,
  type TravelDataReader,
  type WireParser,
} from '@/data/travel-data/client';
import { dataOf, type ReadState } from '@/data/travel-data/freshness';
import { useActiveLocale } from '@/lib/i18n/use-locale';
import { useReadsLocalNames } from '@/data/places/use-shown-names';

import { useLiveRows } from './data/live-rows';
import type { MapPoi } from './map-model';

const POIS_SQL = `SELECT id, name, name_local, category, lat, lng, hours, editorial FROM pois
  WHERE destination_id = ? AND lat IS NOT NULL AND lng IS NOT NULL
    AND coalesce(status, 'active') <> 'hidden' AND category <> 'stay'`;
const POIS_TABLES = ['pois'];

interface PoiRow {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly hours: string | null;
  readonly editorial: string | null;
}

function parse(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** A place in the api's browse of a destination (services/api/src/places/search.ts). */
export interface BrowsePlace {
  readonly id: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  /** The part of town its address names, as the server read it. */
  readonly area: string | null;
  /** In the curated set, or a machine pick where nothing is curated. */
  readonly recommended: boolean;
}

/** The api's most places per browse. */
export const BROWSE_LIMIT = 50;
/** Destinations whose browse is kept for offline; past this the oldest is dropped. */
const BROWSE_CACHE_MAX = 40;

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function browsePlace(value: unknown): BrowsePlace[] {
  if (typeof value !== 'object' || value === null) return [];
  const row = value as Readonly<Record<string, unknown>>;
  const id = text(row['id']);
  const name = text(row['name']);
  const lat = finite(row['lat']);
  const lng = finite(row['lng']);
  if (id === null || name === null || name === '' || lat === null || lng === null) return [];
  return [
    {
      id,
      name,
      nameLocal: text(row['nameLocal']),
      category: text(row['category']) ?? 'other',
      lat,
      lng,
      address: text(row['address']),
      area: text(row['area']),
      recommended: row['recommended'] === true,
    },
  ];
}

/** The browse as kept: the same shape as the wire, so the saved copy parses as the answer did. */
export interface BrowseWire {
  readonly results: readonly BrowsePlace[];
}

/** The browse's places in the api's order; unreadable rows are skipped, a non-list is no answer. */
export const browseSchema: WireParser<BrowseWire> = {
  safeParse(value) {
    const results = (value as { results?: unknown } | null)?.results;
    if (!Array.isArray(results)) return { success: false };
    return { success: true, data: { results: results.flatMap(browsePlace) } };
  },
};

export function browsePath(destinationId: string): string {
  return `/v1/places/search?destination_id=${encodeURIComponent(destinationId)}&limit=${String(BROWSE_LIMIT)}`;
}

let sharedCache: LastGoodCache | undefined;

function browseCache(): LastGoodCache {
  sharedCache ??= createLastGoodCache('cp-place-browse', { max: BROWSE_CACHE_MAX });
  return sharedCache;
}

/** One browse: the api's answer (kept as the last good copy), else that copy, else missing. */
export function readDestinationPlaces(
  reader: TravelDataReader | null,
  destinationId: string,
  cache: LastGoodCache = browseCache(),
): Promise<ReadState<BrowseWire>> {
  return readThrough({
    reader,
    cache,
    path: browsePath(destinationId),
    schema: browseSchema,
    classify: () => ({ status: 'ok', seenAt: null }),
  });
}

/** Reads in flight by destination, so the map, the list and the picks ask the api once. */
const inFlight = new Map<string, Promise<ReadState<BrowseWire>>>();

function sharedRead(reader: TravelDataReader | null, destinationId: string) {
  const pending = inFlight.get(destinationId);
  if (pending !== undefined) return pending;
  const read = readDestinationPlaces(reader, destinationId).finally(() =>
    inFlight.delete(destinationId),
  );
  inFlight.set(destinationId, read);
  return read;
}

/** The api's browse of a destination with its last good copy; null reads nothing. */
export function useDestinationPlaces(destinationId: string | null): ReadState<BrowseWire> {
  const reader = useTravelDataReader();
  const [answer, setAnswer] = useState<{
    readonly id: string;
    readonly state: ReadState<BrowseWire>;
  } | null>(null);
  useEffect(() => {
    if (destinationId === null) return undefined;
    let live = true;
    void sharedRead(reader, destinationId).then((state) => {
      if (live) setAnswer({ id: destinationId, state });
    });
    return () => {
      live = false;
    };
  }, [reader, destinationId]);
  if (destinationId === null) return { status: 'missing', reason: 'no_data' };
  return answer?.id === destinationId ? answer.state : { status: 'loading' };
}

/**
 * The phone's places, then the browse's places it does not hold: the phone's row is richer (hours,
 * the editors' notes), the browse adds what was never synced. Stays are never map places.
 */
export function withBrowsed(
  held: readonly MapPoi[],
  browsed: readonly BrowsePlace[],
  readsLocal: boolean,
): readonly MapPoi[] {
  const ids = new Set(held.map((poi) => poi.id));
  const added = browsed.flatMap((place): MapPoi[] => {
    if (ids.has(place.id) || place.category === 'stay') return [];
    ids.add(place.id);
    const named = shownPlaceName({ name: place.name, nameLocal: place.nameLocal }, readsLocal);
    return [
      {
        id: place.id,
        name: named.shown,
        nameLocal: named.other,
        category: place.category,
        lat: place.lat,
        lng: place.lng,
        hours: null,
        mustSee: false,
        written: false,
        bestTime: null,
      },
    ];
  });
  return added.length === 0 ? held : [...held, ...added];
}

export function useDestinationPois(destinationId: string | null): {
  readonly places: readonly MapPoi[];
  readonly loaded: boolean;
} {
  const browse = useDestinationPlaces(destinationId);
  const browsed = dataOf(browse)?.results;
  const live = useLiveRows<PoiRow>(
    POIS_SQL,
    destinationId === null ? null : [destinationId],
    POIS_TABLES,
  );
  const readsLocal = useReadsLocalNames(destinationId);
  const locale = useActiveLocale();
  const places = useMemo(() => {
    const held = live.rows.map((row): MapPoi => {
      const editorial = editorialFor(row.editorial, locale) as {
        must_see?: unknown;
        why_go?: unknown;
        best_time?: unknown;
      } | null;
      // The name the reader sees first; the other one stays for search and a second line.
      const named = shownPlaceName({ name: row.name, nameLocal: row.name_local }, readsLocal);
      return {
        id: row.id,
        name: named.shown,
        nameLocal: named.other,
        category: row.category,
        lat: row.lat,
        lng: row.lng,
        hours: parse(row.hours),
        mustSee: editorial?.must_see === true,
        written: typeof editorial?.why_go === 'string' && editorial.why_go !== '',
        bestTime:
          typeof editorial?.best_time === 'string' && editorial.best_time !== ''
            ? editorial.best_time
            : null,
      };
    });
    return withBrowsed(held, browsed ?? [], readsLocal);
  }, [live.rows, readsLocal, locale, browsed]);
  // The phone's places show at once; with none, the map waits for the browse (or its copy).
  return {
    places,
    loaded: live.loaded && (live.rows.length > 0 || browse.status !== 'loading'),
  };
}

const PLAN_SQL = `SELECT i.poi_id, d.day_no, i.starts_at FROM trips t
    JOIN plan_items i ON i.version_id = t.current_version_id
    JOIN plan_days d ON d.id = i.day_id
  WHERE t.id = ? AND i.poi_id IS NOT NULL`;
const PLAN_TABLES = ['trips', 'plan_items', 'plan_days'];

export interface PlannedAt {
  readonly dayNo: number;
  readonly startsAt: string | null;
}

/** The places already in the trip's plan, by place id. */
export function usePlannedPlaces(tripId: string | null): ReadonlyMap<string, PlannedAt> {
  const { rows } = useLiveRows<{ poi_id: string; day_no: number; starts_at: string | null }>(
    PLAN_SQL,
    tripId === null ? null : [tripId],
    PLAN_TABLES,
  );
  return useMemo(
    () => new Map(rows.map((row) => [row.poi_id, { dayNo: row.day_no, startsAt: row.starts_at }])),
    [rows],
  );
}
