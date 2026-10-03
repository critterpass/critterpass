/**
 * Place signals from stored rows, shared by the server's fit routes and the plan check job (and
 * the phone): one crowd curve per weekday by the shared source rule, the month's crowd factor,
 * and the rain a date is judged on (the forecast inside the horizon, else the usual chance).
 */
import { pickCrowdCurve, toLocalWallTime } from '@cp/domain';

import type { FitCrowds, FitRain } from './context';

export interface CrowdCurveRow {
  readonly poi_id: string;
  readonly dow: number;
  readonly hourly: readonly number[];
  readonly source: string;
  readonly approved_at: Date | string | null;
}

/** Each place's weekly curve from the sources copy may name; places with none are left out. */
export function crowdWeeks(rows: readonly CrowdCurveRow[]): Map<string, FitCrowds> {
  const byPlace = new Map<string, CrowdCurveRow[]>();
  for (const row of rows) byPlace.set(row.poi_id, [...(byPlace.get(row.poi_id) ?? []), row]);
  const weeks = new Map<string, FitCrowds>();
  for (const [poiId, placeRows] of byPlace) {
    const days = Array.from({ length: 7 }, (_, dow) =>
      pickCrowdCurve(placeRows.filter((row) => row.dow === dow)),
    );
    const source = days.find((day) => day !== null)?.source;
    if (source !== 'visits' && source !== 'editorial') continue;
    weeks.set(poiId, {
      source,
      week: days.map((day) => (day !== null && day.source === source ? day.hourly : null)),
    });
  }
  return weeks;
}

const MIN_FACTOR = 0.6;
const MAX_FACTOR = 1.4;

/** Each month's crowd factor against the destination's average month, within limits. */
export function monthFactors(
  rows: readonly { readonly month: number; readonly crowd_index: number }[],
): Map<number, number> {
  const mean = rows.reduce((sum, row) => sum + row.crowd_index, 0) / Math.max(1, rows.length);
  const factors = new Map<number, number>();
  if (mean <= 0) return factors;
  for (const row of rows) {
    factors.set(row.month, Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, row.crowd_index / mean)));
  }
  return factors;
}

export const FORECAST_HORIZON_DAYS = 3;

/** Forecast hours grouped into 24 local hours per date (only dates with all 24). */
export function forecastByDate(
  hours: readonly { readonly at: string; readonly chance_of_rain: number }[],
  tz: string,
): Map<string, number[]> {
  const byDate = new Map<string, (number | undefined)[]>();
  for (const hour of hours) {
    const local = toLocalWallTime(new Date(hour.at), tz);
    const slots = byDate.get(local.date) ?? Array.from({ length: 24 }, () => undefined);
    slots[Number(local.time.slice(0, 2))] = hour.chance_of_rain;
    byDate.set(local.date, slots);
  }
  const full = new Map<string, number[]>();
  for (const [date, slots] of byDate) {
    if (slots.every((value) => value !== undefined)) full.set(date, slots);
  }
  return full;
}

const DAY_MS = 86_400_000;

/** The rain a date is judged on: the forecast inside the horizon when there is one, else normals. */
export function rainFor(
  date: string,
  today: string,
  forecast: ReadonlyMap<string, readonly number[]>,
  normals: ReadonlyMap<number, readonly number[]>,
  horizonDays = FORECAST_HORIZON_DAYS,
): FitRain | null {
  const ahead = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS;
  const forecastDay = forecast.get(date);
  if (ahead >= 0 && ahead < horizonDays && forecastDay !== undefined) {
    return { hourly: forecastDay, source: 'forecast' };
  }
  const usual = normals.get(Number(date.slice(5, 7)));
  return usual === undefined ? null : { hourly: usual, source: 'normals' };
}
