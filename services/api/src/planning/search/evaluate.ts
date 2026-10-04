/**
 * One pass of a plain-words search: the hard filters (words, kinds of place, meal, price) pick the
 * candidates in search order, then each is checked against the soft ones (attributes, "open past",
 * "≤ N min"). A candidate that breaks no soft filter is a result; one that breaks exactly one is a
 * "louder or further" miss. Minutes are measured for the first fifty candidates only; with a
 * minutes limit, later candidates are not looked at.
 */
import type { FitStop } from '@cp/planner';
import type { PoiCategory, SearchFilter } from '@cp/domain';
import type pg from 'pg';

import { searchPlaceCandidates, type PlaceSearchResultItem } from '../../places/search';
import type { TravelSource } from '../fit/context';
import { minutesFrom, type SearchMinutes } from './anchor';
import { areaFromAddress } from './area';
import { hasAttribute, MEAL_CATEGORIES } from './filters';
import { daySpans, openForMeal, openPast, type DaySpans } from './hours';

/** Candidates the hard filters may return before the soft ones narrow them. */
const CANDIDATE_LIMIT = 150;
/** Candidates whose minutes are measured (one travel call). */
export const MEASURED_LIMIT = 50;

export type SoftMiss = 'attribute' | 'open_past' | 'max_minutes';

export interface Evaluated {
  readonly item: PlaceSearchResultItem;
  readonly area: string | null;
  readonly days: DaySpans;
  readonly minutes: SearchMinutes | null;
  readonly misses: readonly SoftMiss[];
}

export interface SearchContext {
  readonly tx: pg.PoolClient;
  readonly destinationId: string | null;
  readonly destinationName: string | null;
  /** The local dates the search looks at: the trip's days not left out. */
  readonly dates: readonly string[];
  /** Where minutes are measured from: the minutes limit's anchor, else the stay. */
  readonly stops: readonly FitStop[];
  /** The `max_minutes` anchor could be found (a limit with no anchor is not applied). */
  readonly limitAnchored: boolean;
  readonly travel: TravelSource;
  readonly straight: { readonly driveFactor: number; readonly walkMaxM: number };
  readonly near?: { readonly lat: number; readonly lng: number };
  readonly category?: PoiCategory;
}

function categoriesOf(filter: SearchFilter): readonly PoiCategory[] | undefined {
  if (filter.categories !== undefined && filter.categories.length > 0) return filter.categories;
  return filter.meal === undefined ? undefined : MEAL_CATEGORIES[filter.meal];
}

export async function evaluate(ctx: SearchContext, filter: SearchFilter): Promise<Evaluated[]> {
  const text = filter.text?.trim() ?? '';
  const categories = categoriesOf(filter);
  const first = ctx.stops[0];
  const near = ctx.near ?? (text === '' && first !== undefined ? first : undefined);
  const candidates = await searchPlaceCandidates(
    ctx.tx,
    {
      ...(text === '' ? {} : { q: text }),
      ...(near === undefined ? {} : { near: { lat: near.lat, lng: near.lng } }),
      ...(ctx.category === undefined ? {} : { category: ctx.category }),
      ...(categories === undefined ? {} : { categories }),
      ...(filter.price_max === undefined ? {} : { priceMax: filter.price_max }),
      ...(ctx.destinationId === null ? {} : { destinationId: ctx.destinationId }),
    },
    CANDIDATE_LIMIT,
  );
  const withDays = candidates
    .map((candidate) => ({ ...candidate, days: daySpans(candidate.hours, ctx.dates) }))
    .filter(
      (candidate) =>
        filter.meal === undefined || openForMeal(candidate.days, filter.meal) !== false,
    );
  const limit = ctx.limitAnchored ? filter.max_minutes?.minutes : undefined;
  const looked = limit === undefined ? withDays : withDays.slice(0, MEASURED_LIMIT);
  const minutes = await minutesFrom(
    ctx.stops,
    looked.slice(0, MEASURED_LIMIT).map(({ item }) => item),
    ctx.travel,
    ctx.straight,
  );
  return looked.map(({ item, days }) => {
    const measured = minutes.get(item.id) ?? null;
    const misses: SoftMiss[] = [];
    for (const attribute of filter.attributes ?? []) {
      if (!hasAttribute(item, attribute, days)) misses.push('attribute');
    }
    if (filter.open_past !== undefined && openPast(days, filter.open_past) !== true) {
      misses.push('open_past');
    }
    if (limit !== undefined && (measured === null || measured.value > limit)) {
      misses.push('max_minutes');
    }
    return {
      item,
      area: areaFromAddress(item.address, ctx.destinationName),
      days,
      minutes: measured,
      misses,
    };
  });
}
