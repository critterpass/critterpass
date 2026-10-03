/**
 * The place page's planning reads (7e-1): when the place fits the trip (the fit engine's best day,
 * the next best other day and the hour bars over its open span), the fact tiles from our own hours
 * and the approved editorial facts, and the guide's tip and KNOW BEFORE YOU GO lines. A tile with
 * no data is omitted, never guessed.
 */
import {
  editorialOverlaySchema,
  knownHours,
  openSpans,
  toLocalWallTime,
  type DayFit,
  type PlaceFit,
} from '@cp/domain';
import type pg from 'pg';

import { fitForTrip } from '../planning/fit/service';
import { readCrowdWeeks } from '../planning/fit/signals/crowds';
import { tripStaySource } from '../planning/stay';
import type { PlaceFacts } from './plan-read';

export interface FitDayView {
  readonly day_id: string;
  readonly day_no: number;
  readonly date: string;
  /** Local `HH:MM`. */
  readonly start: string;
  readonly end: string;
  readonly starts_at: string;
  readonly ends_at: string;
  readonly grade: DayFit['grade'];
  readonly reasons: DayFit['reasons'];
}

export interface WhenItFits {
  readonly best: FitDayView | null;
  readonly other_best: FitDayView | null;
  readonly days: PlaceFit['days'];
  /**
   * The open span on the best day by whole hours, the crowd level of each of its hours (null
   * without an approved curve) and the hours the best slot covers, lit `[from, to)`.
   */
  readonly bars: {
    readonly from: number;
    readonly to: number;
    readonly hourly: readonly number[] | null;
    readonly lit: { readonly from: number; readonly to: number } | null;
  } | null;
}

export interface PlaceFactTiles {
  readonly open_spans: readonly { readonly from: string; readonly to: string }[];
  /** Whether our own hours are known at all (unknown hides the OPEN tile). */
  readonly hours_known: boolean;
  readonly entry?: string;
  readonly takes_min?: number;
  readonly dress?: string;
}

export const SIMILAR_MIN_MINUTES = 20;
const GRADE_RANK = { good: 0, possible: 1, no: 2 } as const;
const clock = (minute: number): string =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const minuteOf = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

function dayView(fit: DayFit, date: string | undefined, tz: string): FitDayView | null {
  if (fit.slot === null || fit.grade === 'no' || date === undefined) return null;
  return {
    day_id: fit.day_id,
    day_no: fit.day_no,
    date,
    start: toLocalWallTime(new Date(fit.slot.starts_at), tz).time.slice(0, 5),
    end: toLocalWallTime(new Date(fit.slot.ends_at), tz).time.slice(0, 5),
    starts_at: fit.slot.starts_at,
    ends_at: fit.slot.ends_at,
    grade: fit.grade,
    reasons: fit.reasons,
  };
}

/** When the place fits: the engine's best day, the next best other day, and the hour bars. */
export async function whenItFits(
  tx: pg.PoolClient,
  input: { readonly tripId: string; readonly poiId: string; readonly hours: unknown },
): Promise<WhenItFits | null> {
  const result = await fitForTrip(
    tx,
    { tripId: input.tripId, poiIds: [input.poiId], includeContext: true },
    { stays: tripStaySource, now: () => new Date() },
  );
  const fit = result.fits[0];
  const context = result.context;
  if (fit === undefined || context === null) return null;
  const dateOf = (dayId: string) => context.days.find((day) => day.dayId === dayId)?.date;
  const ranked = [...fit.days]
    .filter((day) => day.grade !== 'no' && day.slot !== null)
    .sort((a, b) => GRADE_RANK[a.grade] - GRADE_RANK[b.grade] || a.day_no - b.day_no);
  const bestFit =
    fit.best === null ? undefined : fit.days.find((d) => d.day_id === fit.best?.day_id);
  const best = bestFit === undefined ? null : dayView(bestFit, dateOf(bestFit.day_id), context.tz);
  const other = ranked.find((day) => day.day_id !== bestFit?.day_id);
  const otherBest = other === undefined ? null : dayView(other, dateOf(other.day_id), context.tz);
  return { best, other_best: otherBest, days: fit.days, bars: await bars(tx, input, best) };
}

async function bars(
  tx: pg.PoolClient,
  input: { readonly poiId: string; readonly hours: unknown },
  best: FitDayView | null,
): Promise<WhenItFits['bars']> {
  const hours = knownHours(input.hours);
  if (best === null || hours === null) return null;
  const spans = openSpans(hours, best.date);
  const startMin = minuteOf(best.start);
  const span = spans.find((s) => s.start <= startMin && s.end > startMin) ?? spans[0];
  if (span === undefined) return null;
  const from = Math.floor(span.start / 60);
  const to = Math.min(24, Math.ceil(Math.min(span.end, 1440) / 60));
  const weekday = new Date(`${best.date}T00:00:00Z`).getUTCDay();
  const curve = (await readCrowdWeeks(tx, [input.poiId])).get(input.poiId)?.week[weekday] ?? null;
  const endMin = minuteOf(best.end) > startMin ? minuteOf(best.end) : 1440;
  return {
    from,
    to,
    hourly: curve === null ? null : curve.slice(from, to),
    lit: { from: Math.floor(startMin / 60), to: Math.min(to, Math.ceil(endMin / 60)) },
  };
}

/** Fact tiles from our own hours and the approved editorial facts; a missing one is omitted. */
export function factTiles(place: PlaceFacts, date: string): PlaceFactTiles {
  const hours = knownHours(place.hours);
  const editorial = editorialOverlaySchema.shape;
  const entry = editorial.entry_short.safeParse(place.editorial['entry_short']).data;
  const dress = editorial.dress_short.safeParse(place.editorial['dress_short']).data;
  return {
    open_spans:
      hours === null
        ? []
        : openSpans(hours, date).map((span) => ({ from: clock(span.start), to: clock(span.end) })),
    hours_known: hours !== null,
    ...(entry === undefined ? {} : { entry }),
    ...(place.timeNeededMin === null ? {} : { takes_min: place.timeNeededMin }),
    ...(dress === undefined ? {} : { dress }),
  };
}

export function editorialExtras(place: PlaceFacts) {
  const editorial = editorialOverlaySchema.shape;
  const tips = editorial.tips.safeParse(place.editorial['tips']).data;
  return {
    tip: tips?.[0] ?? null,
    know: editorial.know_before.safeParse(place.editorial['know_before']).data ?? [],
  };
}
