/**
 * The places map and list routes and the params they share, so MAP and LIST hand each other the
 * same filter and a search's results (results mode) and every way in reads them the same.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and param names, never copy. */
import type { Href } from 'expo-router';

import type { PlacesFilter } from './places-model';

export interface PlacesParams {
  readonly filter?: PlacesFilter | undefined;
  /** The place to open on (its label and cards). */
  readonly placeId?: string | undefined;
  /** Results mode: the search's places, comma separated. */
  readonly results?: string | undefined;
  /** Results mode: the search's chips, `|` separated. */
  readonly chips?: string | undefined;
}

export interface PlacesRouteParams {
  readonly filter?: string | undefined;
  readonly placeId?: string | undefined;
  readonly results?: string | undefined;
  readonly chips?: string | undefined;
}

function defined(params: PlacesParams): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
    ),
  );
}

export const placesRoutes = {
  map: (tripId: string, params: PlacesParams = {}): Href => ({
    pathname: '/[tripId]/places',
    params: { tripId, ...defined(params) },
  }),
  list: (tripId: string, params: PlacesParams = {}): Href => ({
    pathname: '/[tripId]/places/list',
    params: { tripId, ...defined(params) },
  }),
};

export interface ResultsMode {
  readonly ids: ReadonlySet<string>;
  readonly chips: readonly string[];
}

/** Results mode from the route's params; null when the screen shows every place. */
export function resultsFrom(params: PlacesRouteParams): ResultsMode | null {
  const ids = (params.results ?? '').split(',').filter((id) => id.length > 0);
  if (ids.length === 0) return null;
  const chips = (params.chips ?? '').split('|').filter((chip) => chip.length > 0);
  return { ids: new Set(ids), chips };
}

/** The params that carry a screen's filter and results to the other one. */
export function carryParams(filter: PlacesFilter, results: PlacesRouteParams): PlacesParams {
  return {
    ...(filter === 'all' ? {} : { filter }),
    results: results.results,
    chips: results.chips,
  };
}
