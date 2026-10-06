/**
 * What Add to plan (7f-1) knows about the place: the server's fit for every day with the context it
 * worked in (`POST …/fit`, `include_context`), so picking a day or a time re-fits on the phone, and
 * the place's own facts the phone re-fits with (our hours, how long a visit takes, the crew's
 * stances) read from synced rows, and its crowd week (an api read, the last good copy offline).
 * Offline, the last answer this run of the app got stays; without one, the sheet still adds, with
 * no dots and no reasons.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, SQL and wire values, never copy. */
import { knownHours, placeFitSchema, visitMinutes, type PlaceFit } from '@cp/domain';
import { crowdWeeks, isOutdoorCategory, type CrowdCurveRow, type FitPlace } from '@cp/planner';
import { useEffect, useMemo, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/device-session';
import type { WireFitContext } from '@/data/fit/local-fit';
import { useLiveRows } from '@/data/plan/live-rows';
import { parseIds } from '@/data/plan/plan-model';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { dataOf } from '@/data/travel-data/freshness';
import { useCrowdForecasts } from '@/data/travel-data/shared-content';

import type { NearbyAdd } from './add-model';

const TIMEOUT_MS = 10_000;

export interface AddFitAnswer {
  readonly fit: PlaceFit | null;
  readonly context: WireFitContext | null;
}

/** The fit answer for one place, or null when the body isn't one. */
export function readAddFit(body: unknown): AddFitAnswer | null {
  const value = body as { fits?: unknown; context?: unknown } | null;
  if (value === null || !Array.isArray(value.fits)) return null;
  const parsed = placeFitSchema.safeParse(value.fits[0]);
  const context =
    typeof value.context === 'object' && value.context !== null
      ? (value.context as WireFitContext)
      : null;
  return { fit: parsed.success ? parsed.data : null, context };
}

const lastGood = new Map<string, AddFitAnswer>();

async function askFit(tripId: string, poiId: string, signal: AbortSignal) {
  const response = await fetch(
    `${resolveApiBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/fit`,
    {
      method: 'POST',
      headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify({ poi_ids: [poiId], include_context: true }),
      signal,
    },
  );
  if (!response.ok) return null;
  return readAddFit(await response.json());
}

export type AddFitStatus = 'loading' | 'ready' | 'offline';

/** The server's fit for the place on this plan version; null for a dropped pin. */
export function useAddFit(
  tripId: string,
  poiId: string | null,
  versionId: string | null,
): AddFitAnswer & { readonly status: AddFitStatus } {
  const key = `${tripId}|${poiId ?? ''}|${versionId ?? ''}`;
  const [state, setState] = useState<{ key: string; status: AddFitStatus }>({
    key: '',
    status: 'loading',
  });
  useEffect(() => {
    if (poiId === null) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    void askFit(tripId, poiId, controller.signal)
      .catch(() => null)
      .then((answer) => {
        if (answer !== null) lastGood.set(key, answer);
        setState({ key, status: answer === null ? 'offline' : 'ready' });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `key` folds in the trip, the place and the version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const answer = lastGood.get(key) ?? { fit: null, context: null };
  const status: AddFitStatus =
    poiId === null ? 'offline' : state.key === key ? state.status : 'loading';
  return { ...answer, status };
}

const PLACE_SQL = `SELECT p.id, p.name, p.category, p.lat, p.lng, p.hours, p.tags,
    json_extract(p.editorial, '$.time_needed_min') AS time_needed_min,
    json_extract(p.editorial, '$.best_time') IS NOT NULL AS best_time,
    json_extract(p.editorial, '$.best_time') AS best_time_text
  FROM pois p WHERE p.id = ?`;
const STANCES_SQL = `SELECT stance, count(*) AS n FROM place_stances
  WHERE trip_id = ? AND poi_id = ? GROUP BY stance`;

interface PlaceRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly hours: string | null;
  readonly time_needed_min: number | null;
  readonly best_time: number;
  readonly best_time_text: string | null;
  /** A JSON text array, or a Postgres array literal. */
  readonly tags: string | null;
}

function parseHours(raw: string | null) {
  if (raw === null) return null;
  try {
    return knownHours(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export interface PlaceCopy {
  readonly name?: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
}

/**
 * The place as the fit engine reads it, from synced rows: a curated place's own facts, or (a place
 * the phone holds no row for, a dropped pin) its spot and kind from the idea, hours unknown.
 */
export function useFitPlace(
  tripId: string,
  poiId: string | null,
  copy: PlaceCopy | null,
): FitPlace | null {
  const place = useLiveRows<PlaceRow>(PLACE_SQL, poiId === null ? null : [poiId], ['pois']);
  const crowds = dataOf(useCrowdForecasts(poiId));
  const stances = useLiveRows<{ stance: string; n: number }>(
    STANCES_SQL,
    poiId === null ? null : [tripId, poiId],
    ['place_stances'],
  );
  return useMemo(() => {
    const row = place.rows[0];
    const spot = row ?? copy;
    if (spot === null || spot === undefined) return null;
    const curves: CrowdCurveRow[] = (crowds?.curves ?? []).map((curve) => ({
      ...curve,
      poi_id: crowds?.poi_id ?? '',
    }));
    const want = stances.rows.find((s) => s.stance === 'want')?.n ?? 0;
    const ratherNot = stances.rows.find((s) => s.stance === 'rather_not')?.n ?? 0;
    return {
      poiId,
      point: { lat: spot.lat, lng: spot.lng },
      category: spot.category,
      hours: row === undefined ? null : parseHours(row.hours),
      timeNeededMin: row?.time_needed_min ?? null,
      outdoor: isOutdoorCategory(spot.category),
      crowds: poiId === null ? null : (crowdWeeks(curves).get(poiId) ?? null),
      stances: { want, ratherNot },
      bestTime: row?.best_time === 1,
      // What the time of day the place is for is read from, as the server reads it.
      name: row?.name ?? copy?.name ?? '',
      tags: parseIds(row?.tags ?? null),
      bestTimeText: typeof row?.best_time_text === 'string' ? row.best_time_text : null,
    };
  }, [copy, crowds, place.rows, poiId, stances.rows]);
}

export interface NearbyPlace {
  readonly poi_id: string;
  readonly name: string;
  readonly category: string;
  readonly minutes: number;
}

/** The closest place worth adding after this one ("Gunung Kawi is 10 min on"), when online. */
export function useNearbyPlace(tripId: string, poiId: string | null): NearbyPlace | null {
  const [nearby, setNearby] = useState<{ key: string; place: NearbyPlace | null }>({
    key: '',
    place: null,
  });
  const key = `${tripId}|${poiId ?? ''}`;
  useEffect(() => {
    if (poiId === null) return undefined;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `${resolveApiBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/places/${encodeURIComponent(poiId)}/nearby?limit=1`,
          { headers: await sessionHeaders(), signal: controller.signal },
        );
        if (!response.ok) return;
        const body = (await response.json()) as { places?: NearbyPlace[] };
        setNearby({ key, place: body.places?.[0] ?? null });
      } catch {
        // Offline: no suggestion.
      }
    })();
    return () => controller.abort();
    // `key` folds in the trip and the place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return nearby.key === key ? nearby.place : null;
}

/** The nearby place as the block after this one: how far on it is and how long a visit takes. */
export function nearbyAddOf(nearby: NearbyPlace | null): NearbyAdd | null {
  if (nearby === null) return null;
  return {
    poiId: nearby.poi_id,
    name: nearby.name,
    category: nearby.category,
    minutes: nearby.minutes,
    lengthMin: visitMinutes({ category: nearby.category, timeNeededMin: null }),
  };
}
