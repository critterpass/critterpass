/**
 * Rain for fit: the stored forecast for dates inside the forecast horizon, else the destination's
 * usual chance for the month (`climate_normals`). Each day says which one it used, so copy can say
 * "forecast" or "usually".
 */
import { localSchedule, toLocalWallTime } from '@cp/domain';
import { FORECAST_HORIZON_DAYS, forecastByDate, rainFor, type FitRain } from '@cp/planner';
import type pg from 'pg';

import { readWeather } from '../../../travel-data/weather-read';

const DAY_MS = 86_400_000;

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
