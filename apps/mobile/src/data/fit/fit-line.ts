/**
 * The one line under a place that says when it fits (7c-3, 7f-2: "Fits Sat at 08:00", "On the way,
 * Wed 16:00", "The crew is split 2–2", "Only fits if Wed lunch moves", "Open late · fits Mon
 * night"), worded on the phone from the fit's grade, slot and reason codes, so every language reads
 * the same fit and nothing the server sends is copy. The tone picks the line's colour.
 */
/* eslint-disable lingui/no-unlocalized-strings -- reason codes and grades, never copy (every line is worded through `t`). */
import { toLocalWallTime, type DayFit, type FitReason, type PlaceFit } from '@cp/domain';
import { t } from '@lingui/core/macro';

export type FitLineTone = 'fits' | 'needsMove' | 'split' | 'none';

export interface FitLine {
  readonly text: string;
  readonly tone: FitLineTone;
}

export interface FitLineContext {
  /** Each day's short weekday in the app's language ("Sat"), by day number. */
  readonly weekdays: ReadonlyMap<number, string>;
  /** The trip's zone: slot times are read on its clock. */
  readonly tz: string;
  /** A plan stop's short name ("lunch", "Tirta Empul") by stable id, when the plan has it. */
  readonly stopName?: ((stableId: string) => string | null) | undefined;
}

/** Closing at or after this hour, with an evening slot, reads "Open late". */
const LATE_CLOSE_HOUR = 22;
const EVENING_HOUR = 18;

function reason<C extends FitReason['code']>(
  reasons: readonly FitReason[],
  code: C,
): Extract<FitReason, { code: C }> | undefined {
  return reasons.find((entry): entry is Extract<FitReason, { code: C }> => entry.code === code);
}

function hourOf(time: string): number {
  return Number(time.slice(0, 2));
}

function clock(iso: string, tz: string): string {
  return toLocalWallTime(new Date(iso), tz).time.slice(0, 5);
}

function splitLine(reasons: readonly FitReason[]): FitLine | null {
  const split = reason(reasons, 'crew_split');
  if (split === undefined) return null;
  const want = String(split.params.want);
  const notWant = String(split.params.rather_not);
  return {
    text: t({ id: 'fit.line.split', message: `The crew is split ${want}–${notWant}` }),
    tone: 'split',
  };
}

function needsMoveLine(day: DayFit, context: FitLineContext): FitLine {
  const weekday = context.weekdays.get(day.day_no) ?? String(day.day_no);
  const moved =
    day.needs_move === null || day.needs_move === undefined
      ? null
      : (context.stopName?.(day.needs_move) ?? null);
  return {
    text:
      moved === null
        ? t({ id: 'fit.line.needsMoveDay', message: `Only fits if something on ${weekday} moves` })
        : t({ id: 'fit.line.needsMove', message: `Only fits if ${weekday} ${moved} moves` }),
    tone: 'needsMove',
  };
}

function fitsLine(day: DayFit, context: FitLineContext): FitLine {
  const weekday = context.weekdays.get(day.day_no) ?? String(day.day_no);
  if (day.slot === null) {
    return { text: t({ id: 'fit.line.fitsDay', message: `Fits ${weekday}` }), tone: 'fits' };
  }
  const time = clock(day.slot.starts_at, context.tz);
  const onTheWay = reason(day.reasons, 'on_the_way');
  if (onTheWay !== undefined) {
    return {
      text: t({ id: 'fit.line.onTheWay', message: `On the way, ${weekday} ${time}` }),
      tone: 'fits',
    };
  }
  const closes = reason(day.reasons, 'closes_at');
  if (
    closes !== undefined &&
    hourOf(closes.params.time) >= LATE_CLOSE_HOUR &&
    hourOf(time) >= EVENING_HOUR
  ) {
    return {
      text: t({ id: 'fit.line.openLate', message: `Open late · fits ${weekday} night` }),
      tone: 'fits',
    };
  }
  const after = reason(day.reasons, 'after_item');
  const afterName =
    after === undefined ? null : (context.stopName?.(after.params.stable_id) ?? null);
  if (afterName !== null) {
    return {
      text: t({ id: 'fit.line.after', message: `Fits ${weekday}, after ${afterName}` }),
      tone: 'fits',
    };
  }
  return { text: t({ id: 'fit.line.fits', message: `Fits ${weekday} at ${time}` }), tone: 'fits' };
}

/**
 * The line for a place's fit: the crew's split first (it caps every day), then the best day, then
 * a day that only fits if a stop moves; null when there is no fit to speak of yet.
 */
export function fitLine(fit: PlaceFit | null, context: FitLineContext): FitLine | null {
  if (fit === null) return null;
  const best =
    fit.best === null ? undefined : fit.days.find((day) => day.day_id === fit.best?.day_id);
  const split = splitLine(best?.reasons ?? fit.days.flatMap((day) => day.reasons));
  if (split !== null) return split;
  if (best !== undefined && best.grade !== 'no') {
    const moves = best.needs_move !== null && best.needs_move !== undefined;
    return moves ? needsMoveLine(best, context) : fitsLine(best, context);
  }
  const moving = fit.days.find((day) => day.needs_move !== null && day.needs_move !== undefined);
  if (moving !== undefined) return needsMoveLine(moving, context);
  return {
    text: t({ id: 'fit.line.none', message: "Doesn't fit your days yet" }),
    tone: 'none',
  };
}
