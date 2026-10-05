/**
 * The place page's trip context with the planning additions (`/v1/places/{id}/context`): when it
 * fits, the fact tiles, the tip and what to know, what is nearby and similar, and where the crew
 * stands. Kept in memory only, like the context it extends; absent offline. A field a server does
 * not send yet, or sends in a shape this build does not know, reads as empty, never as a failure.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire keys, never copy. */
import {
  dayFitSchema,
  fitReasonSchema,
  placeContextSchema,
  type DayFit,
  type FitReason,
  type PlaceContextWire,
} from '@cp/domain';

import type { LastGoodCache, WireParser } from '@/data/travel-data/client';
import type { ReadState } from '@/data/travel-data/freshness';
import { useTravelRead } from '@/data/travel-data/use-travel-read';

import { placeContextPath } from '../data/use-place-context';

export interface FitDayView {
  readonly day_id: string;
  readonly day_no: number;
  readonly date: string;
  readonly start: string;
  readonly end: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly grade: 'good' | 'possible' | 'no';
  readonly reasons: readonly FitReason[];
}

export interface PlaceRef {
  readonly poi_id: string;
  readonly name: string;
  readonly category: string;
  readonly minutes: number;
}

export interface FitBars {
  readonly from: number;
  readonly to: number;
  readonly hourly: readonly number[] | null;
  readonly lit: { readonly from: number; readonly to: number } | null;
}

export interface FactTiles {
  readonly openSpans: readonly { readonly from: string; readonly to: string }[];
  readonly hoursKnown: boolean;
  readonly entry: string | null;
  readonly takesMin: number | null;
  readonly dress: string | null;
}

export interface SplitSummary {
  readonly want: readonly string[];
  readonly ratherNot: readonly string[];
  readonly silent: readonly string[];
  readonly split: boolean;
}

export interface PlaceDetailContext extends PlaceContextWire {
  readonly fromStay: { readonly name: string; readonly minutes: number } | null;
  readonly fits: {
    readonly best: FitDayView | null;
    readonly otherBest: FitDayView | null;
    readonly days: readonly DayFit[];
    readonly bars: FitBars | null;
  } | null;
  readonly facts: FactTiles | null;
  readonly tip: string | null;
  readonly know: readonly { readonly title: string; readonly detail: string | null }[];
  readonly nearby: readonly PlaceRef[];
  readonly similar: readonly PlaceRef[];
  readonly stances: SplitSummary | null;
  /**
   * The plan my plan screens show: the crew's, or my own draft before there is one (an organiser);
   * null when I have none to see. An older server does not say: the crew's plan stands in.
   */
  readonly planVersion: string | null;
}

type Bag = Readonly<Record<string, unknown>>;

const bag = (value: unknown): Bag | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Bag) : null;
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const strings = (value: unknown): string[] => list(value).flatMap((v) => str(v) ?? []);

function parsed<T>(schema: WireParser<T>, value: unknown): T[] {
  const result = schema.safeParse(value);
  return result.success ? [result.data] : [];
}

function dayView(value: unknown): FitDayView | null {
  const day = bag(value);
  const grade = str(day?.['grade']);
  const fields = ['day_id', 'date', 'start', 'end', 'starts_at', 'ends_at'].map((k) =>
    str(day?.[k]),
  );
  const dayNo = num(day?.['day_no']);
  if (day === null || dayNo === null || fields.some((f) => f === null)) return null;
  if (grade !== 'good' && grade !== 'possible' && grade !== 'no') return null;
  const [dayId, date, start, end, startsAt, endsAt] = fields as string[];
  return {
    day_id: dayId ?? '',
    day_no: dayNo,
    date: date ?? '',
    start: start ?? '',
    end: end ?? '',
    starts_at: startsAt ?? '',
    ends_at: endsAt ?? '',
    grade,
    reasons: list(day['reasons']).flatMap((r) => parsed(fitReasonSchema, r)),
  };
}

function placeRef(value: unknown): PlaceRef[] {
  const ref = bag(value);
  const [id, name, category] = ['poi_id', 'name', 'category'].map((k) => str(ref?.[k]));
  const minutes = num(ref?.['minutes']);
  return id && name && category && minutes !== null
    ? [{ poi_id: id, name, category, minutes }]
    : [];
}

function fitsOf(value: unknown): PlaceDetailContext['fits'] {
  const fits = bag(value);
  if (fits === null) return null;
  const bars = bag(fits['bars']);
  const lit = bag(bars?.['lit']);
  const [from, to] = [num(bars?.['from']), num(bars?.['to'])];
  const hourly = Array.isArray(bars?.['hourly'])
    ? list(bars['hourly']).flatMap((h) => num(h) ?? [])
    : null;
  const [litFrom, litTo] = [num(lit?.['from']), num(lit?.['to'])];
  return {
    best: dayView(fits['best']),
    otherBest: dayView(fits['other_best']),
    days: list(fits['days']).flatMap((d) => parsed(dayFitSchema, d)),
    bars:
      from === null || to === null
        ? null
        : {
            from,
            to,
            hourly,
            lit: litFrom === null || litTo === null ? null : { from: litFrom, to: litTo },
          },
  };
}

function factsOf(value: unknown): FactTiles | null {
  const facts = bag(value);
  if (facts === null) return null;
  return {
    openSpans: list(facts['open_spans']).flatMap((span) => {
      const s = bag(span);
      const [from, to] = [str(s?.['from']), str(s?.['to'])];
      return from && to ? [{ from, to }] : [];
    }),
    hoursKnown: facts['hours_known'] === true,
    entry: str(facts['entry']),
    takesMin: num(facts['takes_min']),
    dress: str(facts['dress']),
  };
}

export function readPlaceDetail(value: unknown): PlaceDetailContext | null {
  const base = placeContextSchema.safeParse(value);
  const raw = bag(value);
  if (!base.success || raw === null) return null;
  const stay = bag(raw['from_stay']);
  const stayName = str(stay?.['name']);
  const stayMinutes = num(stay?.['minutes']);
  const split = bag(raw['split']);
  return {
    ...base.data,
    fromStay:
      stayName === null || stayMinutes === null ? null : { name: stayName, minutes: stayMinutes },
    fits: fitsOf(raw['when_it_fits']),
    facts: factsOf(raw['facts']),
    tip: str(raw['tip']),
    know: list(raw['know']).flatMap((entry) => {
      const k = bag(entry);
      const title = str(k?.['title']);
      return title === null ? [] : [{ title, detail: str(k?.['detail']) }];
    }),
    nearby: list(raw['nearby']).flatMap(placeRef),
    similar: list(raw['similar']).flatMap(placeRef),
    stances:
      split === null
        ? null
        : {
            want: strings(split['want']),
            ratherNot: strings(split['rather_not']),
            silent: strings(split['silent_user_ids']),
            split: split['split'] === true,
          },
    planVersion: str(bag(raw['plan_version'])?.['id']) ?? base.data.base_version,
  };
}

export const placeDetailParser: WireParser<PlaceDetailContext> = {
  safeParse(value) {
    const data = readPlaceDetail(value);
    return data === null ? { success: false } : { success: true, data };
  },
};

const answers = new Map<string, { savedAt: string; body: unknown }>();
const memoryCache: LastGoodCache = {
  get: (key) => answers.get(key),
  set: (key, body, savedAt) => {
    answers.set(key, { savedAt: savedAt.toISOString(), body });
  },
};

export function usePlaceDetailContext(
  poiId: string | null,
  tripId: string | null,
): ReadState<PlaceDetailContext> {
  return useTravelRead({
    path: placeContextPath(poiId, tripId),
    schema: placeDetailParser,
    classify: () => ({ status: 'ok', seenAt: null }),
    cache: memoryCache,
  });
}
