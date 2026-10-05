/**
 * Plain words as a place search (7d-2): the parse's filters minus the chips taken off, as the
 * search route's query, and the route's answer read back. Removing a chip never asks the model
 * again: it only drops that chip's filter.
 */
/* eslint-disable lingui/no-unlocalized-strings -- query keys and wire values, never copy. */
import {
  placeFitSchema,
  poiCategorySchema,
  type PlaceFit,
  type SearchChip,
  type SearchFilter,
} from '@cp/domain';

/** A chip's stable key, for removal and React keys. */
export function chipKey(chip: SearchChip): string {
  switch (chip.code) {
    case 'category':
      return `category:${chip.params.category}`;
    case 'meal':
      return `meal:${chip.params.meal}`;
    case 'attribute':
      return `attribute:${chip.params.attribute}`;
    case 'open_past':
      return 'open_past';
    case 'max_minutes':
      return 'max_minutes';
    case 'exclude_days':
      return 'exclude_days';
    case 'price_max':
      return 'price_max';
  }
}

function without<T>(list: readonly T[] | undefined, value: T): T[] | undefined {
  const next = (list ?? []).filter((entry) => entry !== value);
  return next.length === 0 ? undefined : next;
}

function set<K extends keyof SearchFilter>(
  filters: SearchFilter,
  key: K,
  value: SearchFilter[K] | undefined,
): SearchFilter {
  const next: Record<string, unknown> = { ...filters };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/** The filters with one chip's part taken off. */
export function filtersWithout(filters: SearchFilter, chip: SearchChip): SearchFilter {
  switch (chip.code) {
    case 'category':
      return set(filters, 'categories', without(filters.categories, chip.params.category));
    case 'meal':
      return set(filters, 'meal', undefined);
    case 'attribute':
      return set(filters, 'attributes', without(filters.attributes, chip.params.attribute));
    case 'open_past':
      return set(filters, 'open_past', undefined);
    case 'max_minutes':
      return set(filters, 'max_minutes', undefined);
    case 'exclude_days': {
      const removed = new Set(chip.params.day_ids);
      const left = (filters.exclude_day_ids ?? []).filter((id) => !removed.has(id));
      return set(filters, 'exclude_day_ids', left.length === 0 ? undefined : left);
    }
    case 'price_max':
      return set(filters, 'price_max', undefined);
  }
}

/** The filters a way out reruns with: the wider time, or the related word or kind of place. */
export function filtersFor(filters: SearchFilter, way: WayOut): SearchFilter | null {
  if (way.kind === 'widen') {
    const minutes = way.params['minutes'];
    const max = filters.max_minutes;
    if (typeof minutes !== 'number' || max === undefined) return null;
    return { ...filters, max_minutes: { ...max, minutes } };
  }
  if (way.kind === 'related') {
    const term = way.params['term'];
    if (typeof term === 'string') return { ...filters, text: term };
    const category = poiCategorySchema.safeParse(way.params['category']);
    return category.success ? { ...filters, categories: [category.data] } : null;
  }
  return null;
}

/** The search route's query for `filters` on this trip, with fit lines and ways out. */
export function plainSearchQuery(
  filters: SearchFilter,
  trip: { readonly tripId: string; readonly destinationId: string | null },
  /** The question as typed: places named for what she asked come first. */
  words?: string,
): string {
  const params = new URLSearchParams({ trip_id: trip.tripId, fit: '1', relax: '1', limit: '20' });
  if (trip.destinationId !== null) params.set('destination_id', trip.destinationId);
  if (filters.text !== undefined && filters.text !== '') params.set('q', filters.text);
  if (words !== undefined && words.trim() !== '') params.set('words', words.trim().slice(0, 200));
  if (filters.categories !== undefined) params.set('categories', filters.categories.join(','));
  if (filters.attributes !== undefined) params.set('attrs', filters.attributes.join(','));
  if (filters.meal !== undefined) params.set('meal', filters.meal);
  if (filters.open_past !== undefined) params.set('open_past', filters.open_past);
  if (filters.price_max !== undefined) params.set('price_max', String(filters.price_max));
  if (filters.exclude_day_ids !== undefined) {
    params.set('exclude_day_ids', filters.exclude_day_ids.join(','));
  }
  const max = filters.max_minutes;
  if (max !== undefined) {
    params.set(
      'max_minutes',
      max.from === 'stay'
        ? `stay:${String(max.minutes)}`
        : max.from === 'poi'
          ? `poi:${max.poi_id}:${String(max.minutes)}`
          : `day_route:${max.day_id}:${String(max.minutes)}`,
    );
  }
  return `/v1/places/search?${params.toString()}`;
}

export interface PlainPlace {
  readonly id: string;
  readonly name: string;
  /** The name in the destination's own language, when the place has one. */
  readonly nameLocal?: string | null;
  readonly category: string | null;
  readonly area: string | null;
  readonly minutes: { readonly value: number; readonly mode: 'walk' | 'drive' } | null;
  readonly closesAt: string | null;
  readonly fit: PlaceFit | null;
}

export interface WayOut {
  readonly kind: 'widen' | 'related' | 'pin';
  readonly params: Readonly<Record<string, unknown>>;
  readonly count: number;
  readonly areas: readonly string[];
  readonly openLate: number | null;
}

export interface PlainAnswer {
  readonly places: readonly PlainPlace[];
  readonly softMisses: readonly PlainPlace[];
  readonly waysOut: readonly WayOut[];
  /**
   * Places close to what was asked, when nothing matched all of it: what a looser search found,
   * and the chip codes it dropped to find them.
   */
  readonly close: {
    readonly places: readonly PlainPlace[];
    readonly dropped: readonly string[];
  } | null;
  readonly nearest: {
    readonly name: string;
    readonly area: string | null;
    readonly minutes: number | null;
  } | null;
}

type Raw = Record<string, unknown>;
const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);

function placeOf(raw: unknown): PlainPlace[] {
  const value = raw as Raw | null;
  if (value === null || typeof value !== 'object') return [];
  const id = text(value['id']);
  const name = text(value['name']);
  if (id === null || name === null) return [];
  const minutes = value['minutes'] as Raw | null | undefined;
  const fit = placeFitSchema.safeParse(value['fit']);
  return [
    {
      id,
      name,
      nameLocal: text(value['nameLocal']),
      category: text(value['category']),
      area: text(value['area']),
      minutes:
        minutes !== null && minutes !== undefined && num(minutes['value']) !== null
          ? {
              value: num(minutes['value']) ?? 0,
              mode: minutes['mode'] === 'walk' ? 'walk' : 'drive',
            }
          : null,
      closesAt: text(value['closesAt']),
      fit: fit.success ? fit.data : null,
    },
  ];
}

function list(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

/** The search route's answer, read leniently: unknown or missing parts are left out. */
export function readPlainAnswer(body: unknown): PlainAnswer {
  const value = (body ?? {}) as Raw;
  const waysOut = list(value['ways_out']).flatMap((raw): WayOut[] => {
    const way = raw as Raw;
    const kind = way['kind'];
    if (kind !== 'widen' && kind !== 'related' && kind !== 'pin') return [];
    return [
      {
        kind,
        params: (way['label_params'] ?? {}) as Readonly<Record<string, unknown>>,
        count: num(way['count']) ?? 0,
        areas: list(way['areas']).flatMap((area) => (typeof area === 'string' ? [area] : [])),
        openLate: num(way['open_late']),
      },
    ];
  });
  const nearest = value['nearest'] as Raw | null | undefined;
  const nearestName = nearest === null || nearest === undefined ? null : text(nearest['name']);
  const close = value['close'] as Raw | null | undefined;
  const closePlaces =
    close === null || close === undefined ? [] : list(close['results']).flatMap(placeOf);
  return {
    places: list(value['results']).flatMap(placeOf),
    softMisses: list(value['soft_misses']).flatMap(placeOf),
    waysOut,
    close:
      close === null || close === undefined || closePlaces.length === 0
        ? null
        : {
            places: closePlaces,
            dropped: list(close['dropped']).flatMap((code) =>
              typeof code === 'string' ? [code] : [],
            ),
          },
    nearest:
      nearest === null || nearest === undefined || nearestName === null
        ? null
        : { name: nearestName, area: text(nearest['area']), minutes: num(nearest['minutes']) },
  };
}
