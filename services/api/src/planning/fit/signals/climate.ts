/**
 * Rain for fit: the hourly chance of rain from the stored forecast for dates inside the forecast
 * horizon (three days by default), else the destination's usual chance for the month
 * (`climate_normals`). Each day says which one it used, so copy can say "forecast" or "usually".
 */
import { localSchedule, toLocalWallTime, type WeatherHour } from '@cp/domain';
import type { FitRain } from '@cp/planner';
import type pg from 'pg';

import { readWeather } from '../../../travel-data/weather-read';

export const FORECAST_HORIZON_DAYS = 3;

/** Forecast hours grouped into 24 local hours per date (dates with all 24 only). */
export function forecastByDate(hours: readonly WeatherHour[], tz: string): Map<string, number[]> {
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

export async function readNormals(
  tx: pg.PoolClient,
  destinationId: string | null,
): Promise<Map<number, number[]>> {
  if (destinationId === null) return new Map();
  const { rows } = await tx.query<{ month: number; rain_pct: number[] }>(
    `SELECT DISTINCT ON (month) month, rain_pct FROM climate_normals
      WHERE destination_id = $1 ORDER BY month, computed_at DESC`,
    [destinationId],
  );
  return new Map(rows.map((row) => [row.month, row.rain_pct]));
}

/** Rain per trip date at a point (the stay, else the destination's centre). */
export async function readRain(
  tx: pg.PoolClient,
  input: {
    readonly destinationId: string | null;
    readonly point: { readonly lat: number; readonly lng: number } | null;
    readonly dates: readonly string[];
    readonly tz: string;
    readonly now: Date;
  },
): Promise<Map<string, FitRain>> {
  const normals = await readNormals(tx, input.destinationId);
  const today = toLocalWallTime(input.now, input.tz).date;
  let forecast = new Map<string, number[]>();
  if (input.point !== null) {
    const series = await readWeather(tx, {
      lat: input.point.lat,
      lng: input.point.lng,
      from: localSchedule({ date: today, time: '00:00', tz: input.tz }),
      to: new Date(input.now.getTime() + (FORECAST_HORIZON_DAYS + 1) * DAY_MS),
      now: input.now,
    });
    forecast = forecastByDate(series.hourly, input.tz);
  }
  const rain = new Map<string, FitRain>();
  for (const date of input.dates) {
    const day = rainFor(date, today, forecast, normals);
    if (day !== null) rain.set(date, day);
  }
  return rain;
}
