/**
 * Tokek's suggestions for a trip (7c-3 "TOKEK SUGGESTS"): the destination's curated places that
 * nobody saved, the caller didn't hide and the plan doesn't hold, ranked by how well they fit the
 * trip's days. Every candidate gets a coarse fit on stored legs and straight lines (hours, gaps,
 * crowds, rain); only the top places' insertions are routed, in one batched call, and refitted.
 *
 * The ranked list is kept per (trip, plan version, categories, caller) for ten minutes, so paging
 * and coming back to the list never refit; a new plan version is a new key. Saves and hides are
 * taken out on every read, so a swipe shows at once.
 */
import type { PlaceFit } from '@cp/domain';
import {
  fitPlace,
  layeredTravel,
  legKey,
  straightLineTravel,
  type FitContext,
  type FitLeg,
} from '@cp/planner';
import type pg from 'pg';

import {
  loadFitContext,
  straightLineSource,
  tripFitFacts,
  type LegPair,
  type TripFitFacts,
} from '../fit/context';
import { insertionPairs, type FitDeps } from '../fit/service';
import { readFitPlaces } from '../fit/signals/visit';

/** Places whose insertions go to the router; the rest keep their straight-line fit. */
export const ROUTED_TOP = 20;
export const SUGGEST_TTL_MS = 10 * 60_000;
const CACHE_MAX = 100;

const GRADE_RANK = { good: 0, possible: 1, no: 2 } as const;

interface Ranked {
  readonly poiId: string;
  readonly name: string;
  readonly fit: PlaceFit;
}

/** The order of the list: the best grade, then the smallest detour on that day, then the name. */
export function compareFits(a: Ranked, b: Ranked): number {
  const grade = (fit: PlaceFit) => (fit.best === null ? 3 : GRADE_RANK[fit.best.grade]);
  const detour = (fit: PlaceFit) => {
    const day = fit.days.find((entry) => entry.day_id === fit.best?.day_id);
    return day?.detour_minutes ?? Number.MAX_SAFE_INTEGER;
  };
  return (
    grade(a.fit) - grade(b.fit) ||
    detour(a.fit) - detour(b.fit) ||
    a.name.localeCompare(b.name) ||
    a.poiId.localeCompare(b.poiId)
  );
}

interface CacheEntry {
  readonly at: number;
  readonly ranked: readonly Ranked[];
}

const cache = new Map<string, CacheEntry>();

function remember(key: string, entry: CacheEntry): void {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Forget every kept list (tests). */
export function clearSuggestCache(): void {
  cache.clear();
}

async function candidateIds(
  tx: pg.PoolClient,
  destinationId: string,
  categories: readonly string[],
): Promise<string[]> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT p.id FROM pois p
      WHERE p.destination_id = $1 AND p.status = 'active' AND p.curation = 'editorial'
        AND p.merged_into_id IS NULL AND p.category NOT IN ('stay', 'transit')
        AND (cardinality($2::text[]) = 0 OR p.category = ANY($2::text[]))
      ORDER BY p.id`,
    [destinationId, categories],
  );
  return rows.map((row) => row.id);
}

/** Places the crew saved for the trip, or the caller hid: out of the suggestions on every read. */
async function excludedIds(tx: pg.PoolClient, tripId: string): Promise<Set<string>> {
  const { rows } = await tx.query<{ poi_id: string }>(
    `SELECT poi_id FROM trip_ideas WHERE trip_id = $1 AND deleted_at IS NULL AND poi_id IS NOT NULL
     UNION SELECT poi_id FROM place_hides WHERE user_id = app.uid()`,
    [tripId],
  );
  return new Set(rows.map((row) => row.poi_id));
}

async function rankAll(
  tx: pg.PoolClient,
  trip: TripFitFacts,
  categories: readonly string[],
  deps: FitDeps,
): Promise<Ranked[]> {
  if (trip.destinationId === null) return [];
  const loaded = await loadFitContext(tx, trip, { stays: deps.stays, now: deps.now() });
  const ids = await candidateIds(tx, trip.destinationId, categories);
  const facts = (await readFitPlaces(tx, trip.id, ids, loaded.inPlan)).filter(
    ({ place }) => !loaded.inPlan.has(place.poiId),
  );
  const straight = straightLineTravel(loaded.context.driveFactor, loaded.thresholds.walkMaxM);
  const coarse: FitContext = {
    ...loaded.context,
    travel: layeredTravel(loaded.storedLegs, straight),
  };
  const first = facts
    .map(({ place, row }) => ({ poiId: place.poiId, name: row.name, fit: fitPlace(coarse, place) }))
    .sort(compareFits);
  const top = new Set(first.slice(0, ROUTED_TOP).map((entry) => entry.poiId));
  const pairs = new Map<string, LegPair>();
  for (const { place } of facts) {
    if (!top.has(place.poiId)) continue;
    const fit = first.find((entry) => entry.poiId === place.poiId)?.fit;
    if (fit === undefined) continue;
    for (const pair of insertionPairs(coarse, fit, { key: place.poiId, ...place.point })) {
      const key = legKey(pair.from.key, pair.to.key);
      if (!loaded.storedLegs.has(key)) pairs.set(key, pair);
    }
  }
  if (pairs.size === 0) return first;
  const source = (deps.travel ?? straightLineSource)(
    loaded.context.driveFactor,
    loaded.thresholds.walkMaxM,
  );
  const routed: Map<string, FitLeg> = await source.legs([...pairs.values()]);
  const fine: FitContext = {
    ...loaded.context,
    travel: layeredTravel(new Map([...loaded.storedLegs, ...routed]), straight),
  };
  const refit = new Map(
    facts
      .filter(({ place }) => top.has(place.poiId))
      .map(({ place }) => [place.poiId, fitPlace(fine, place)] as const),
  );
  return first
    .map((entry) => ({ ...entry, fit: refit.get(entry.poiId) ?? entry.fit }))
    .sort(compareFits);
}

export interface SuggestInput {
  readonly tripId: string;
  readonly uid: string;
  readonly categories: readonly string[];
  readonly limit: number;
  /** Position in the ranked list to read from (the previous page's `next_cursor`). */
  readonly cursor: number;
}

export interface SuggestPage {
  readonly places: readonly { readonly poi_id: string; readonly fit: PlaceFit }[];
  readonly next_cursor: string | null;
  /** Every suggestion left for the caller, all pages together. */
  readonly total: number;
}

export async function suggestPlaces(
  tx: pg.PoolClient,
  input: SuggestInput,
  deps: FitDeps,
): Promise<SuggestPage> {
  // The version decides the key; reading it also answers NOT_FOUND for anyone outside the trip.
  const trip = await tripFitFacts(tx, input.tripId);
  const categories = [...new Set(input.categories)].sort();
  const key = [input.tripId, trip.versionId ?? '', categories.join(','), input.uid].join('|');
  const now = deps.now().getTime();
  const kept = cache.get(key);
  let ranked: readonly Ranked[];
  if (kept !== undefined && now - kept.at < SUGGEST_TTL_MS) {
    ranked = kept.ranked;
  } else {
    ranked = await rankAll(tx, trip, categories, deps);
    remember(key, { at: now, ranked });
  }
  const excluded = await excludedIds(tx, input.tripId);
  const places: { poi_id: string; fit: PlaceFit }[] = [];
  let index = input.cursor;
  for (; index < ranked.length && places.length < input.limit; index += 1) {
    const entry = ranked[index];
    if (entry !== undefined && !excluded.has(entry.poiId)) {
      places.push({ poi_id: entry.poiId, fit: entry.fit });
    }
  }
  const more = ranked.slice(index).some((entry) => !excluded.has(entry.poiId));
  return {
    places,
    next_cursor: more ? String(index) : null,
    total: ranked.filter((entry) => !excluded.has(entry.poiId)).length,
  };
}
