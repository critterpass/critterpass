/**
 * Shared reference content read over the api (docs/api-contracts.md §5.5), never synced: the public
 * ideas board, a destination's reviewed season months and events and its cost indices, and a
 * place's weekly crowd curves. Each read goes through `useTravelRead`: the api's answer, kept as the
 * last good copy (MMKV, its own instance, the newest 400), else that copy, else `missing`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, storage key or wire value, never copy. */
import { createLastGoodCache, type Classification, type LastGoodCache } from './client';
import type { ReadState } from './freshness';
import { useTravelRead } from './use-travel-read';

export interface BoardIdea {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly votes_count: number;
}

export interface IdeasBoard {
  readonly ideas: readonly BoardIdea[];
}

export interface SeasonMonth {
  readonly month: number;
  readonly crowd_index: number;
  readonly highlight_tag: string | null;
  readonly colour_role: string;
  readonly source: string;
}

export interface SeasonEvent {
  readonly key: string;
  readonly kind: string;
  readonly name: string;
  readonly starts_on: string;
  readonly ends_on: string;
}

export interface DestinationSeason {
  readonly destination_id: string;
  readonly months: readonly SeasonMonth[];
  readonly events: readonly SeasonEvent[];
}

export interface CostIndex {
  readonly stay_type: string;
  readonly nightly_minor_low: number;
  readonly nightly_minor_high: number;
  readonly food_pp_day_minor: number;
  readonly fun_pp_day_minor: number;
  readonly currency: string;
}

export interface DestinationCostIndices {
  readonly destination_id: string;
  readonly indices: readonly CostIndex[];
}

export interface CrowdCurve {
  readonly dow: number;
  /** 24 levels (0 empty … 100 packed), index = local hour. */
  readonly hourly: readonly number[];
  readonly source: string;
  readonly fetched_at: string;
  readonly approved_at: string | null;
}

export interface PlaceCrowdForecasts {
  readonly poi_id: string;
  readonly curves: readonly CrowdCurve[];
}

type Shape = Readonly<Record<string, 'string' | 'number' | 'string?' | 'numbers'>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fits(value: unknown, shape: Shape): boolean {
  if (!isRecord(value)) return false;
  return Object.entries(shape).every(([key, kind]) => {
    const field = value[key];
    if (kind === 'string?') return field === null || typeof field === 'string';
    if (kind === 'numbers') {
      return Array.isArray(field) && field.every((item) => typeof item === 'number');
    }
    return typeof field === kind;
  });
}

/** A `WireParser` for `{...head, [list]: item[]}`, checking only the fields the app reads. */
function wire<T>(head: Shape, lists: Readonly<Record<string, Shape>>) {
  return {
    safeParse(value: unknown): { success: true; data: T } | { success: false } {
      const ok =
        fits(value, head) &&
        Object.entries(lists).every(([key, item]) => {
          const list = (value as Record<string, unknown>)[key];
          return Array.isArray(list) && list.every((entry) => fits(entry, item));
        });
      return ok ? { success: true, data: value as T } : { success: false };
    },
  };
}

export const ideasBoardSchema = wire<IdeasBoard>(
  {},
  { ideas: { id: 'string', title: 'string', status: 'string', votes_count: 'number' } },
);

export const destinationSeasonSchema = wire<DestinationSeason>(
  { destination_id: 'string' },
  {
    months: {
      month: 'number',
      crowd_index: 'number',
      highlight_tag: 'string?',
      colour_role: 'string',
      source: 'string',
    },
    events: {
      key: 'string',
      kind: 'string',
      name: 'string',
      starts_on: 'string',
      ends_on: 'string',
    },
  },
);

export const costIndicesSchema = wire<DestinationCostIndices>(
  { destination_id: 'string' },
  {
    indices: {
      stay_type: 'string',
      nightly_minor_low: 'number',
      nightly_minor_high: 'number',
      food_pp_day_minor: 'number',
      fun_pp_day_minor: 'number',
      currency: 'string',
    },
  },
);

export const crowdForecastsSchema = wire<PlaceCrowdForecasts>(
  { poi_id: 'string' },
  {
    curves: {
      dow: 'number',
      hourly: 'numbers',
      source: 'string',
      fetched_at: 'string',
      approved_at: 'string?',
    },
  },
);

/** Reviewed reference content has no read time of its own; an empty answer is still an answer. */
const classify = (): Classification => ({ status: 'ok', seenAt: null });

let shared: LastGoodCache | undefined;

export function sharedContentCache(): LastGoodCache {
  shared ??= createLastGoodCache('cp-shared-content', { max: 400 });
  return shared;
}

function idPath(prefix: string, id: string | null, suffix: string): string | null {
  return id === null ? null : `${prefix}/${encodeURIComponent(id)}/${suffix}`;
}

/** Every idea past review, most voted first (`GET /v1/help/ideas`). */
export function useIdeasBoard(): ReadState<IdeasBoard> {
  return useTravelRead({
    path: '/v1/help/ideas',
    schema: ideasBoardSchema,
    classify,
    cache: sharedContentCache(),
  });
}

/** A destination's reviewed season months and events; `id` is its id or slug. */
export function useDestinationSeason(id: string | null): ReadState<DestinationSeason> {
  return useTravelRead({
    path: idPath('/v1/destinations', id, 'season'),
    schema: destinationSeasonSchema,
    classify,
    cache: sharedContentCache(),
  });
}

/** A destination's reviewed cost index per stay type, cheapest first; `id` is its id or slug. */
export function useCostIndices(id: string | null): ReadState<DestinationCostIndices> {
  return useTravelRead({
    path: idPath('/v1/destinations', id, 'cost-indices'),
    schema: costIndicesSchema,
    classify,
    cache: sharedContentCache(),
  });
}

/** Every weekly crowd curve of a place (an editorial one only once approved). */
export function useCrowdForecasts(poiId: string | null): ReadState<PlaceCrowdForecasts> {
  return useTravelRead({
    path: idPath('/v1/places', poiId, 'crowd-forecasts'),
    schema: crowdForecastsSchema,
    classify,
    cache: sharedContentCache(),
  });
}
