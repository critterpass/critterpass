/**
 * The deterministic half of the blog benchmark: how one drafted trip compares with what travel
 * blogs recommend for a first visit. Every metric is 0..1 (null when the draft or the reference
 * gives nothing to judge it on):
 *
 * - coverage: the share of the places blogs agree on that the draft holds;
 * - coherence: each day in 1-2 areas, no further than the blogs' own days walk, no return to an
 *   area the day already left;
 * - time fit: stops placed inside the times of day they are best at;
 * - meals: a real meal place at lunch and at dinner every day;
 * - diversity: kinds of stop per day, no place twice in the trip;
 * - personal fit: how much more of the trip matches the crew's tastes than the neutral draft.
 */
import { metresBetween } from '@cp/planner';

import { consensusPlaces, type Reference, type ReferencePlace } from './reference';

export interface ScoredStop {
  readonly poiId: string | null;
  readonly name: string;
  readonly kind: 'activity' | 'meal';
  /** Local minute of the day the stop starts. */
  readonly startMin: number;
  /** Local minute the sun sets at the stop on its day. */
  readonly sunsetMin: number;
  readonly lat: number;
  readonly lng: number;
  readonly category: string;
  readonly tags: readonly string[];
  readonly bestTimes: readonly string[];
  readonly mealRole: 'meal' | 'light' | null;
  readonly area: string | null;
  readonly ref: ReferencePlace | null;
}

export interface ScoredDay {
  readonly dayNo: number;
  readonly theme: string;
  readonly stops: readonly ScoredStop[];
}

export interface DraftMetrics {
  readonly coverage: number | null;
  readonly coherence: number | null;
  readonly timeFit: number | null;
  readonly meals: number | null;
  readonly diversity: number | null;
  readonly personalFit: number | null;
}

/** Local minutes a best time covers (`after_dark` runs past midnight). */
export const BEST_TIME_WINDOWS: Readonly<Record<string, readonly [number, number]>> = {
  early_morning: [300, 510],
  morning: [420, 690],
  midday: [660, 870],
  afternoon: [810, 1050],
  evening: [1050, 1320],
  after_dark: [1140, 1560],
};
/**
 * A sunset stop follows the real sun at the place on the day: begun up to two hours before it
 * (the golden hour pages send people up for) and no later than an hour after it, when the sky has
 * gone dark. Three hours wide, like the other times of day.
 */
const SUNSET_BEFORE_MIN = 120;
const SUNSET_AFTER_MIN = 60;

/** The local minutes `time` covers for `stop`, or undefined for a time the scorer does not know. */
function windowOf(time: string, stop: ScoredStop): readonly [number, number] | undefined {
  return time === 'sunset'
    ? [stop.sunsetMin - SUNSET_BEFORE_MIN, stop.sunsetMin + SUNSET_AFTER_MIN]
    : BEST_TIME_WINDOWS[time];
}
const LUNCH: readonly [number, number] = [660, 870];
const DINNER: readonly [number, number] = [1020, 1290];

const within = (minute: number, [from, to]: readonly [number, number]) =>
  minute >= from && minute <= to;
const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

export function coverage(days: readonly ScoredDay[], reference: Reference): number | null {
  const agreed = consensusPlaces(reference);
  if (agreed.length === 0) return null;
  const held = new Set(days.flatMap((day) => day.stops.flatMap((s) => (s.ref ? [s.ref] : []))));
  return agreed.filter((place) => held.has(place)).length / agreed.length;
}

/** Straight-line kilometres from stop to stop. */
export function dayKm(points: readonly { readonly lat: number; readonly lng: number }[]): number {
  let metres = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a !== undefined && b !== undefined) metres += metresBetween(a, b);
  }
  return metres / 1000;
}

/** How far the blogs' own days walk: the median of the consensus days, never under 3 km. */
export function referenceKm(reference: Reference): number {
  const byName = new Map(reference.places.map((p) => [p.name_en, p]));
  const kms = reference.days
    .map((day) => dayKm(day.stops.flatMap((name) => byName.get(name) ?? [])))
    .sort((a, b) => a - b);
  const median = kms[Math.floor(kms.length / 2)] ?? 0;
  return Math.max(3, median * 1.25);
}

export interface DayShape {
  readonly areas: number;
  readonly km: number;
  readonly backtracks: number;
}

export function dayShape(day: ScoredDay): DayShape {
  const order = day.stops.flatMap((s) => (s.area === null ? [] : [s.area]));
  const seen = new Set<string>();
  let backtracks = 0;
  let current: string | null = null;
  for (const area of order) {
    if (area === current) continue;
    if (seen.has(area)) backtracks += 1;
    seen.add(area);
    current = area;
  }
  return { areas: seen.size, km: dayKm(day.stops), backtracks };
}

export function coherence(days: readonly ScoredDay[], reference: Reference): number | null {
  const limit = referenceKm(reference);
  return mean(
    days
      .filter((day) => day.stops.length > 1)
      .map((day) => {
        const shape = dayShape(day);
        const areas = shape.areas <= 2 ? 1 : 2 / shape.areas;
        const km = shape.km <= limit ? 1 : limit / shape.km;
        return areas * km * (1 / (1 + shape.backtracks));
      }),
  );
}

/** Whether a stop has times of day it is best at and starts outside all of them. */
export function missesItsTime(stop: ScoredStop): boolean {
  return (
    stop.kind === 'activity' &&
    stop.bestTimes.length > 0 &&
    !stop.bestTimes.some((time) => {
      const window = windowOf(time, stop);
      return window !== undefined && within(stop.startMin, window);
    })
  );
}

export function timeFit(days: readonly ScoredDay[]): number | null {
  const timed = days.flatMap((day) =>
    day.stops.filter((s) => s.kind === 'activity' && s.bestTimes.length > 0),
  );
  if (timed.length === 0) return null;
  return timed.filter((stop) => !missesItsTime(stop)).length / timed.length;
}

export function meals(days: readonly ScoredDay[]): number | null {
  return mean(
    days.map((day) => {
      const real = (window: readonly [number, number]) =>
        day.stops.some(
          (s) => s.kind === 'meal' && s.mealRole === 'meal' && within(s.startMin, window),
        );
      return ((real(LUNCH) ? 1 : 0) + (real(DINNER) ? 1 : 0)) / 2;
    }),
  );
}

export function diversity(days: readonly ScoredDay[]): number | null {
  const all = days.flatMap((day) => day.stops.filter((s) => s.poiId !== null));
  if (all.length === 0) return null;
  const repeats = all.length - new Set(all.map((s) => s.poiId)).size;
  const perDay = mean(
    days.flatMap((day) => {
      const activities = day.stops.filter((s) => s.kind === 'activity');
      if (activities.length === 0) return [];
      const kinds = new Set(activities.map((s) => s.category)).size;
      return [Math.min(1, kinds / Math.min(activities.length, 3))];
    }),
  );
  return (perDay ?? 0) * (1 - repeats / all.length);
}

/** The share of stops that carry one of the crew's taste tags. */
export function tasteShare(days: readonly ScoredDay[], tastes: readonly string[]): number | null {
  const stops = days.flatMap((day) => day.stops);
  if (stops.length === 0 || tastes.length === 0) return null;
  return stops.filter((s) => s.tags.some((tag) => tastes.includes(tag))).length / stops.length;
}

/** 0.5 when the crew's tastes shape the trip no more than the neutral draft, 1 at +50 points. */
export function personalFit(
  days: readonly ScoredDay[],
  neutral: readonly ScoredDay[],
  tastes: readonly string[],
): number | null {
  const mine = tasteShare(days, tastes);
  const base = tasteShare(neutral, tastes);
  if (mine === null || base === null) return null;
  return Math.min(1, Math.max(0, 0.5 + (mine - base)));
}

export function draftMetrics(
  days: readonly ScoredDay[],
  reference: Reference,
  personal: { readonly neutral: readonly ScoredDay[]; readonly tastes: readonly string[] } | null,
): DraftMetrics {
  return {
    coverage: coverage(days, reference),
    coherence: coherence(days, reference),
    timeFit: timeFit(days),
    meals: meals(days),
    diversity: diversity(days),
    personalFit:
      personal === null || personal.tastes.length === 0
        ? null
        : personalFit(days, personal.neutral, personal.tastes),
  };
}

/** What each metric counts towards a draft's score; the judge's verdict weighs most. */
export const WEIGHTS = {
  coverage: 0.2,
  coherence: 0.15,
  timeFit: 0.1,
  meals: 0.1,
  diversity: 0.1,
  personalFit: 0.1,
  judge: 0.25,
} as const;

/** 0..100: the weighted mean of the metrics a draft has (the judge's 0..1 among them). */
export function overall(metrics: DraftMetrics, judge: number | null): number {
  let sum = 0;
  let weight = 0;
  for (const [key, value] of Object.entries({ ...metrics, judge })) {
    if (value === null) continue;
    const w = WEIGHTS[key as keyof typeof WEIGHTS];
    sum += w * value;
    weight += w;
  }
  return weight === 0 ? 0 : (100 * sum) / weight;
}
