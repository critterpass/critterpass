/**
 * `GET /v1/places/search` with plain-words filters (docs/api-contracts-planning.md, search): the
 * trip's days not left out are the days hours are read on, minutes come from the minutes limit's
 * anchor (else the stay), `fit=1` adds each place's fit with left-out days removed, and `relax=1`
 * answers ways out when nothing matched. Read as the caller: a trip they are not on is NOT_FOUND.
 */
import type { PlaceFit, PoiCategory, SearchFilter } from '@cp/domain';
import type pg from 'pg';

import type { PlaceSearchResultItem } from '../../places/search';
import {
  readFitThresholds,
  tripFitFacts,
  type TravelSource,
  type TripFitFacts,
} from '../fit/context';
import { fitForTrip, type FitDeps } from '../fit/service';
import { anchorStops, type SearchMinutes } from './anchor';
import { closeTo, type DroppedPart } from './close';
import { evaluate, MEASURED_LIMIT, type Evaluated, type SearchContext } from './evaluate';
import { closesAt } from './hours';
import { waysOut, type Nearest, type WayOut } from './relax';

export interface TripSearchDeps {
  readonly travel: (driveFactor: number, walkMaxM: number) => TravelSource;
  readonly fit: FitDeps;
}

export interface TripSearchInput {
  readonly filter: SearchFilter;
  readonly tripId?: string;
  readonly destinationId?: string;
  readonly near?: { readonly lat: number; readonly lng: number };
  readonly category?: PoiCategory;
  readonly limit: number;
  readonly fit: boolean;
  readonly relax: boolean;
  /** The question as typed. */
  readonly words?: string;
}

export interface TripSearchItem extends PlaceSearchResultItem {
  readonly area: string | null;
  readonly minutes: SearchMinutes | null;
  readonly closesAt: string | null;
  readonly fit?: PlaceFit;
}

export interface TripSearchResponse {
  readonly results: readonly TripSearchItem[];
  readonly soft_misses: readonly TripSearchItem[];
  readonly ways_out?: readonly WayOut[];
  readonly nearest?: Nearest | null;
  /** Nothing matched all of it: what matches once the weakest parts are dropped, and which. */
  readonly close?: {
    readonly results: readonly TripSearchItem[];
    readonly dropped: readonly DroppedPart[];
  };
}

interface TripDay {
  readonly id: string;
  readonly date: string | null;
}

async function tripDays(tx: pg.PoolClient, trip: TripFitFacts | null): Promise<TripDay[]> {
  if (trip?.versionId === null || trip === null) return [];
  const { rows } = await tx.query<TripDay>(
    `SELECT id, to_char(date, 'YYYY-MM-DD') AS date FROM plan_days
      WHERE version_id = $1 ORDER BY day_no`,
    [trip.versionId],
  );
  return rows;
}

/** A week from today, so a search with no trip days still reads every weekday's hours. */
function nextWeek(now: Date): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(now.getTime() + i * 86_400_000).toISOString().slice(0, 10),
  );
}

const GRADE_RANK = { good: 0, possible: 1, no: 2 } as const;

/** The fit without the left-out days, its best day chosen again from the rest. */
export function withoutDays(fit: PlaceFit, excluded: ReadonlySet<string>): PlaceFit {
  const days = fit.days.filter((day) => !excluded.has(day.day_id));
  const best = days
    .filter((day) => day.grade !== 'no' && day.slot !== null)
    .sort((a, b) => GRADE_RANK[a.grade] - GRADE_RANK[b.grade] || a.day_no - b.day_no)[0];
  return {
    ...fit,
    days,
    best:
      best?.slot == null
        ? null
        : { day_id: best.day_id, day_no: best.day_no, grade: best.grade, slot: best.slot },
  };
}

async function context(
  tx: pg.PoolClient,
  input: TripSearchInput,
  deps: TripSearchDeps,
): Promise<{ ctx: SearchContext; days: TripDay[] }> {
  const trip = input.tripId === undefined ? null : await tripFitFacts(tx, input.tripId);
  const destinationId = input.destinationId ?? trip?.destinationId ?? null;
  const name =
    destinationId === null
      ? null
      : ((
          await tx.query<{ name: string }>('SELECT name FROM destinations WHERE id = $1', [
            destinationId,
          ])
        ).rows[0]?.name ?? null);
  const days = await tripDays(tx, trip);
  const excluded = new Set(input.filter.exclude_day_ids ?? []);
  const dates = days.flatMap((day) =>
    day.date === null || excluded.has(day.id) ? [] : [day.date],
  );
  const looked = dates.length > 0 ? dates : nextWeek(new Date());
  const anchor = input.filter.max_minutes ?? (trip === null ? null : { from: 'stay' as const });
  const tripRef = trip === null ? null : { id: trip.id, versionId: trip.versionId };
  const stops = anchor === null ? [] : await anchorStops(tx, anchor, tripRef, dates[0] ?? null);
  const { walkMaxM } = await readFitThresholds(tx);
  const driveFactor = trip?.driveFactor ?? 1;
  const ctx: SearchContext = {
    tx,
    destinationId,
    destinationName: name,
    dates: looked,
    stops,
    limitAnchored: input.filter.max_minutes !== undefined && stops.length > 0,
    travel: deps.travel(driveFactor, walkMaxM),
    straight: { driveFactor, walkMaxM },
    ...(input.near === undefined ? {} : { near: input.near }),
    ...(input.category === undefined ? {} : { category: input.category }),
    ...(input.words === undefined ? {} : { words: input.words }),
  };
  return { ctx, days };
}

export async function tripSearch(
  tx: pg.PoolClient,
  input: TripSearchInput,
  deps: TripSearchDeps,
): Promise<TripSearchResponse> {
  const { ctx, days } = await context(tx, input, deps);
  const evaluated = await evaluate(ctx, input.filter);
  const results = evaluated.filter((place) => place.misses.length === 0).slice(0, input.limit);
  const softMisses = evaluated.filter((place) => place.misses.length === 1).slice(0, input.limit);
  const rerun = async (filter: SearchFilter) =>
    (await evaluate(ctx, filter)).filter((place) => place.misses.length === 0);
  const close =
    input.relax && results.length === 0 ? await closeTo(input.filter, evaluated, rerun) : null;
  const closeResults = close === null ? [] : close.results.slice(0, input.limit);

  const fits = new Map<string, PlaceFit>();
  if (input.fit && input.tripId !== undefined) {
    const ids = [
      ...new Set([...results, ...softMisses, ...closeResults].map((place) => place.item.id)),
    ].slice(0, MEASURED_LIMIT);
    if (ids.length > 0) {
      const excluded = new Set(input.filter.exclude_day_ids ?? []);
      const { fits: all } = await fitForTrip(tx, { tripId: input.tripId, poiIds: ids }, deps.fit);
      for (const fit of all) {
        if (fit.poi_id !== null) fits.set(fit.poi_id, withoutDays(fit, excluded));
      }
    }
  }
  const dateOf = new Map(days.map((day) => [day.id, day.date]));
  const toItem = (place: Evaluated): TripSearchItem => {
    const fit = fits.get(place.item.id);
    const bestDate = fit?.best ? (dateOf.get(fit.best.day_id) ?? null) : null;
    return {
      ...place.item,
      area: place.area,
      minutes: place.minutes,
      closesAt: closesAt(place.days, bestDate),
      ...(fit === undefined ? {} : { fit }),
    };
  };
  const response: TripSearchResponse = {
    results: results.map(toItem),
    soft_misses: softMisses.map(toItem),
  };
  if (!input.relax || results.length > 0) return response;
  const relaxed = await waysOut(input.filter, evaluated, input.limit, rerun);
  return {
    ...response,
    ways_out: relaxed.ways_out,
    nearest: relaxed.nearest,
    ...(close === null
      ? {}
      : { close: { results: closeResults.map(toItem), dropped: close.dropped } }),
  };
}
