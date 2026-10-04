/**
 * The hours a block may move into on the rain and crowds screen (7h-4): open, inside the day's
 * window, dry when it is outdoors (below the rain limit, and never wetter than where it was), and
 * quiet when crowds are why it moves. Also the day's wet window and crowd bars for the chart.
 */
import type { OpenSpan } from '@cp/domain';

import type { CheckDay } from '../check/rules/shared';
import { placeOf, spansOf } from '../check/rules/shared';
import type { CrowdSource, FitRain } from '../fit/context';
import type { ModelItem } from '../fit/day-model';
import { crowdDay, type CrowdDay } from '../fit/reasons';

export const hoursOf = (start: number, end: number): number[] => {
  const hours: number[] = [];
  for (let hour = Math.floor(start / 60); hour * 60 < end && hour < 24; hour += 1) hours.push(hour);
  return hours;
};

export function rainLimit(check: CheckDay): number {
  const rain = check.day.rain;
  const { thresholds } = check.input;
  return rain?.source === 'forecast' ? thresholds.rainPct : thresholds.normalRainPct;
}

/** The highest chance of rain over `[start, end)`; 0 without hourly rain. */
export function wettest(rain: FitRain | null, start: number, end: number): number {
  if (rain === null || rain.hourly.length !== 24) return 0;
  return Math.max(0, ...hoursOf(start, end).map((hour) => rain.hourly[hour] ?? 0));
}

export function crowdOf(check: CheckDay, item: ModelItem): CrowdDay | null {
  const place = placeOf(check, item);
  return crowdDay(place?.crowds ?? null, check.day.date, check.day.crowdFactor);
}

function intersect(a: readonly OpenSpan[], b: readonly OpenSpan[]): OpenSpan[] {
  const out: OpenSpan[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (end > start) out.push({ start, end });
    }
  }
  return out.sort((p, q) => p.start - q.start);
}

/** Runs of hours that pass `ok`, as spans of local minutes. */
function hourRuns(ok: (hour: number) => boolean): OpenSpan[] {
  const runs: OpenSpan[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    if (!ok(hour)) continue;
    const last = runs[runs.length - 1];
    if (last !== undefined && last.end === hour * 60)
      runs[runs.length - 1] = { ...last, end: hour * 60 + 60 };
    else runs.push({ start: hour * 60, end: hour * 60 + 60 });
  }
  return runs;
}

export interface MoveNeeds {
  readonly outdoor: boolean;
  /** Crowds are why it moves: every hour of the visit must be below the busy level. */
  readonly quiet: boolean;
}

/** Where `item` may sit after a move, as spans; empty = nowhere. */
export function allowedSpans(check: CheckDay, item: ModelItem, needs: MoveNeeds): OpenSpan[] {
  const { day } = check;
  const limit = rainLimit(check);
  const was = wettest(day.rain, item.start, item.end);
  const ceiling = was >= limit ? limit - 1 : was;
  const crowd = needs.quiet ? crowdOf(check, item) : null;
  const busy = check.input.thresholds.busyLevel;
  const hourOk = (hour: number) => {
    const chance = day.rain?.hourly.length === 24 ? (day.rain.hourly[hour] ?? 0) : 0;
    if (needs.outdoor && chance > ceiling) return false;
    return crowd === null || (crowd.levels[hour] ?? 0) < busy;
  };
  const open = spansOf(check, item) ?? [{ start: 0, end: 1440 }];
  return intersect(intersect(hourRuns(hourOk), open), [{ start: day.fromMin, end: day.toMin }]);
}

/** The day's wet stretch: first to last hour at or over the rain limit. */
export function wetWindow(check: CheckDay): { from: number; to: number } | null {
  const rain = check.day.rain;
  if (rain === null || rain.hourly.length !== 24) return null;
  const limit = rainLimit(check);
  const wet = rain.hourly.flatMap((chance, hour) => (chance >= limit ? [hour] : []));
  const first = wet[0];
  const last = wet[wet.length - 1];
  return first === undefined || last === undefined
    ? null
    : { from: first * 60, to: last * 60 + 60 };
}

/**
 * The crowd bars: for each hour, the busiest of the day's places that have a curve. Visit counts
 * name themselves only when every curve shown came from visits; any editorial curve makes the
 * whole row "usually busy".
 */
export function crowdBars(
  check: CheckDay,
): { readonly source: CrowdSource; readonly hourly: readonly number[] } | null {
  const days = check.model.items.flatMap((item) => {
    const crowd = crowdOf(check, item);
    return crowd === null ? [] : [crowd];
  });
  if (days.length === 0) return null;
  return {
    source: days.every((crowd) => crowd.source === 'visits') ? 'visits' : 'editorial',
    hourly: Array.from({ length: 24 }, (_, hour) =>
      Math.max(...days.map((crowd) => crowd.levels[hour] ?? 0)),
    ),
  };
}
