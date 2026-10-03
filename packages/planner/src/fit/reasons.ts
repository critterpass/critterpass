/**
 * The place signals a slot is judged on, and the reasons they give: crowds (a typical week × the
 * month's factor, named by its source), rain (forecast inside the horizon, else the usual chance
 * for the month; outdoor places only) and opening hours. Every reason is a code with numbers;
 * the app words it.
 */
import { openThrough, type FitReason, type OpenSpan } from '@cp/domain';

import type { CrowdSource, FitPlace, FitRain, FitThresholds, WeatherSource } from './context';
import { clockOf } from './day-model';

export interface CrowdDay {
  readonly levels: readonly number[];
  readonly source: CrowdSource;
}

/** The place's crowd level for each hour of `date`, or null with no curve. */
export function crowdDay(place: FitPlace, date: string, factor: number): CrowdDay | null {
  if (!place.crowds) return null;
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  const curve = place.crowds.week[dow];
  if (!curve || curve.length !== 24) return null;
  return {
    levels: curve.map((level) => Math.max(0, Math.min(100, Math.round(level * factor)))),
    source: place.crowds.source,
  };
}

const hoursOf = (start: number, end: number): number[] => {
  const hours: number[] = [];
  for (let hour = Math.floor(start / 60); hour * 60 < end && hour < 24; hour += 1) hours.push(hour);
  return hours;
};

/** The run of busy hours holding the first busy hour at or after `hour`, as local minutes. */
function busyRun(levels: readonly number[], hour: number, busy: number) {
  const isBusy = (h: number) => (levels[h] ?? 0) >= busy;
  let first = Math.max(0, hour);
  while (first < 24 && !isBusy(first)) first += 1;
  if (first >= 24) return null;
  let start = first;
  while (start > 0 && isBusy(start - 1)) start -= 1;
  let end = first;
  let peak = 0;
  while (end < 24 && isBusy(end)) {
    peak = Math.max(peak, levels[end] ?? 0);
    end += 1;
  }
  return { from: start * 60, to: end * 60, peak };
}

export function slotIsBusy(crowd: CrowdDay | null, start: number, end: number, busy: number) {
  return crowd !== null && hoursOf(start, end).some((hour) => (crowd.levels[hour] ?? 0) >= busy);
}

/** Whether the place has a quiet stretch long enough for a visit inside the day's window. */
export function quietExists(
  crowd: CrowdDay | null,
  spans: readonly OpenSpan[],
  window: { readonly fromMin: number; readonly toMin: number },
  visitMin: number,
  busy: number,
): boolean {
  if (crowd === null) return false;
  for (let start = window.fromMin; start + visitMin <= window.toMin; start += 15) {
    const end = start + visitMin;
    if (openThrough(spans, start, end) && !slotIsBusy(crowd, start, end, busy)) return true;
  }
  return false;
}

export function crowdReasons(
  crowd: CrowdDay | null,
  start: number,
  end: number,
  busy: number,
  openFrom: number,
): FitReason[] {
  if (crowd === null) return [];
  const hours = hoursOf(start, end);
  const busyHour = hours.find((hour) => (crowd.levels[hour] ?? 0) >= busy);
  if (busyHour !== undefined) {
    const run = busyRun(crowd.levels, busyHour, busy);
    if (run === null) return [];
    const reasons: FitReason[] = [
      {
        code: 'busy_from',
        params: { time: clockOf(run.from), level: run.peak, source: crowd.source },
      },
    ];
    if (run.from > openFrom) {
      reasons.push({
        code: 'quiet_until',
        params: { time: clockOf(run.from), source: crowd.source },
      });
    }
    return reasons;
  }
  const later = busyRun(crowd.levels, Math.ceil(end / 60), busy);
  if (later === null) return [];
  return [
    {
      code: 'busy_from',
      params: { time: clockOf(later.from), level: later.peak, source: crowd.source },
    },
  ];
}

export function rainLimit(source: WeatherSource, thresholds: FitThresholds): number {
  return source === 'forecast' ? thresholds.rainPct : thresholds.normalRainPct;
}

export interface RainCheck {
  readonly rainy: boolean;
  readonly reasons: FitReason[];
}

const NOON = 12 * 60;

/** Rain over an outdoor slot: a trade-off when likely, a reason either way when the day has rain. */
export function rainCheck(
  rain: FitRain | null,
  outdoor: boolean,
  start: number,
  end: number,
  dayFrom: number,
  thresholds: FitThresholds,
): RainCheck {
  if (!outdoor || rain === null || rain.hourly.length !== 24) return { rainy: false, reasons: [] };
  const limit = rainLimit(rain.source, thresholds);
  const wet = (hour: number) => (rain.hourly[hour] ?? 0) >= limit;
  const slotHours = hoursOf(start, end);
  const wetHour = slotHours.find(wet);
  if (wetHour !== undefined) {
    let to = wetHour;
    while (to < 24 && wet(to)) to += 1;
    const pct = Math.max(...slotHours.map((hour) => rain.hourly[hour] ?? 0));
    return {
      rainy: true,
      reasons: [
        {
          code: 'rain_likely',
          params: {
            from: clockOf(wetHour * 60),
            to: clockOf(Math.min(to * 60, 1439)),
            pct,
            source: rain.source,
          },
        },
      ],
    };
  }
  const dayWet = rain.hourly.some((_, hour) => wet(hour));
  if (!dayWet) return { rainy: false, reasons: [] };
  const morningDry = hoursOf(dayFrom, NOON).every((hour) => !wet(hour));
  if (end <= NOON && morningDry) {
    return { rainy: false, reasons: [{ code: 'dry_mornings', params: { source: rain.source } }] };
  }
  return {
    rainy: false,
    reasons: [
      {
        code: 'dry_window',
        params: { from: clockOf(start), to: clockOf(end), source: rain.source },
      },
    ],
  };
}
