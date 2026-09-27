/**
 * `weather.refresh` (every 15 minutes; each point decides whether it is due): hourly forecasts for
 * every destination with an active trip, per point: the destination centroid, its summits (the
 * centroid forecast carried up by the lapse rate, since the API takes no elevation), and one 0.1°
 * cell per group of outdoor plan-item places away from the centroid. Sea conditions from the
 * destination's coastal point ride on the centroid rows while a trip there has boat items.
 *
 * Cadence per point: 3 h by default, 1 h within 48 h of an outdoor item, 15 min for marine while a
 * trip with boat items is under way. A failed fetch keeps the last snapshot and stamps
 * `checked_at`, so readers show it as stale instead of dropping it; nothing is ever invented.
 */
import { withSystem } from '@cp/db';
import {
  adjustTempForElevation,
  CENTROID_POINT_KEY,
  MARINE_REFRESH_LIVE_MINUTES,
  summitPointKey,
  WEATHER_REFRESH_MINUTES,
  WEATHER_REFRESH_NEAR_MINUTES,
  WEATHER_RETENTION_DAYS,
  type MarineSnapshotBody,
  type WeatherSnapshotBody,
} from '@cp/domain';
import type pg from 'pg';

import type { JobLogger } from '../boss/define-job';
import { emitForecastChanges, readPointForecast } from './forecast-watch';
import { selectWeatherPlans, type WeatherPoint } from './weather-points';
import type { ForecastDays, WeatherPointQuery } from './weatherapi-client';

export interface WeatherSource {
  forecast(query: WeatherPointQuery, signal?: AbortSignal): Promise<ForecastDays>;
  marine(
    query: WeatherPointQuery,
    signal?: AbortSignal,
  ): Promise<ReadonlyMap<string, MarineSnapshotBody>>;
}

async function lastFetched(
  tx: pg.PoolClient,
  destinationId: string,
  pointKey: string,
  column: 'fetched_at' | 'marine_fetched_at',
): Promise<Date | null> {
  const { rows } = await tx.query<{ at: Date | null }>(
    `SELECT max(${column}) AS at FROM weather_snapshots
      WHERE destination_id = $1 AND point_key = $2`,
    [destinationId, pointKey],
  );
  return rows[0]?.at ?? null;
}

function isDue(last: Date | null, minutes: number, now: Date): boolean {
  return last === null || now.getTime() - last.getTime() >= minutes * 60_000 - 30_000;
}

/** The centroid forecast carried to a summit's height (temperatures only; rain and wind as-is). */
export function carryToElevation(
  body: WeatherSnapshotBody,
  fromM: number,
  toM: number,
): WeatherSnapshotBody {
  return {
    ...body,
    day: {
      ...body.day,
      max_temp_c: adjustTempForElevation(body.day.max_temp_c, fromM, toM),
      min_temp_c: adjustTempForElevation(body.day.min_temp_c, fromM, toM),
    },
    hours: body.hours.map((hour) => ({
      ...hour,
      temp_c: adjustTempForElevation(hour.temp_c, fromM, toM),
    })),
  };
}

async function storeForecast(
  tx: pg.PoolClient,
  destinationId: string,
  point: WeatherPoint & { elevation_m: number | null },
  days: ReadonlyMap<string, WeatherSnapshotBody>,
  now: Date,
): Promise<void> {
  for (const [date, body] of days) {
    await tx.query(
      `INSERT INTO weather_snapshots (destination_id, point_key, lat, lng, elevation_m, date, hourly,
         source, fetched_at, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'weatherapi', $8, $8)
       ON CONFLICT (destination_id, point_key, date, source) DO UPDATE SET
         lat = EXCLUDED.lat, lng = EXCLUDED.lng, elevation_m = EXCLUDED.elevation_m,
         hourly = EXCLUDED.hourly, fetched_at = EXCLUDED.fetched_at, checked_at = EXCLUDED.checked_at`,
      [
        destinationId,
        point.key,
        point.lat,
        point.lng,
        point.elevation_m,
        date,
        JSON.stringify(body),
        now,
      ],
    );
  }
}

async function markFailed(tx: pg.PoolClient, destinationId: string, pointKey: string, now: Date) {
  await tx.query(
    'UPDATE weather_snapshots SET checked_at = $3 WHERE destination_id = $1 AND point_key = $2',
    [destinationId, pointKey, now],
  );
}

export interface WeatherRefreshReport {
  readonly destinations: number;
  readonly forecasts: number;
  readonly marine: number;
  readonly failed: number;
  readonly purged: number;
  /** `forecast.changed` events appended. */
  readonly events: number;
}

export interface RefreshWeatherOptions {
  readonly pool: pg.Pool;
  readonly source: WeatherSource;
  readonly logger: JobLogger;
  readonly forecastDays: number;
  readonly marineDays: number;
  readonly now?: Date;
  readonly signal?: AbortSignal;
}

export async function refreshWeather(
  options: RefreshWeatherOptions,
): Promise<WeatherRefreshReport> {
  const now = options.now ?? new Date();
  const { pool, source, signal } = options;
  const plans = await withSystem(pool, (tx) => selectWeatherPlans(tx, now));
  let forecasts = 0;
  let marine = 0;
  let failed = 0;
  let events = 0;

  for (const plan of plans) {
    const interval = plan.outdoorSoon ? WEATHER_REFRESH_NEAR_MINUTES : WEATHER_REFRESH_MINUTES;
    const { centroid } = plan.travel;
    const points: (WeatherPoint & { elevation_m: number | null })[] = [
      {
        key: CENTROID_POINT_KEY,
        lat: centroid.lat,
        lng: centroid.lng,
        elevation_m: centroid.elevation_m,
      },
      ...plan.gridPoints.map((point) => ({ ...point, elevation_m: null })),
    ];
    for (const point of points) {
      const last = await withSystem(pool, (tx) =>
        lastFetched(tx, plan.destinationId, point.key, 'fetched_at'),
      );
      if (!isDue(last, interval, now)) continue;
      try {
        const result = await source.forecast(
          { lat: point.lat, lng: point.lng, days: options.forecastDays },
          signal,
        );
        events += await withSystem(pool, async (tx) => {
          const before = await readPointForecast(tx, plan.destinationId, point.key);
          await storeForecast(tx, plan.destinationId, point, result.days, now);
          const after = await readPointForecast(tx, plan.destinationId, point.key);
          const watch = {
            destinationId: plan.destinationId,
            travel: plan.travel,
            pointKey: point.key,
          };
          const changed = await emitForecastChanges(tx, { ...watch, before, after });
          if (point.key !== CENTROID_POINT_KEY) return changed;
          for (const summit of plan.travel.summits) {
            const carried = new Map(
              [...result.days].map(([date, body]) => [
                date,
                carryToElevation(body, centroid.elevation_m, summit.elevation_m),
              ]),
            );
            await storeForecast(
              tx,
              plan.destinationId,
              {
                key: summitPointKey(summit.name),
                lat: summit.lat,
                lng: summit.lng,
                elevation_m: summit.elevation_m,
              },
              carried,
              now,
            );
          }
          return changed;
        });
        forecasts += 1;
      } catch (error) {
        failed += 1;
        options.logger.warn({ err: error, point: point.key }, 'weather refresh failed');
        await withSystem(pool, (tx) => markFailed(tx, plan.destinationId, point.key, now));
      }
    }

    const coast = plan.travel.marine;
    if (!plan.marineNeeded || coast === null) continue;
    const lastMarine = await withSystem(pool, (tx) =>
      lastFetched(tx, plan.destinationId, CENTROID_POINT_KEY, 'marine_fetched_at'),
    );
    if (!isDue(lastMarine, plan.marineLive ? MARINE_REFRESH_LIVE_MINUTES : interval, now)) continue;
    try {
      const days = await source.marine({ ...coast, days: options.marineDays }, signal);
      events += await withSystem(pool, async (tx) => {
        const before = await readPointForecast(tx, plan.destinationId, CENTROID_POINT_KEY);
        for (const [date, body] of days) {
          await tx.query(
            `UPDATE weather_snapshots SET marine = $4, marine_fetched_at = $5
              WHERE destination_id = $1 AND point_key = $2 AND date = $3`,
            [plan.destinationId, CENTROID_POINT_KEY, date, JSON.stringify(body), now],
          );
        }
        const after = await readPointForecast(tx, plan.destinationId, CENTROID_POINT_KEY);
        return emitForecastChanges(tx, {
          destinationId: plan.destinationId,
          travel: plan.travel,
          pointKey: CENTROID_POINT_KEY,
          before,
          after,
        });
      });
      marine += 1;
    } catch (error) {
      failed += 1;
      options.logger.warn({ err: error }, 'marine refresh failed');
      await withSystem(pool, (tx) => markFailed(tx, plan.destinationId, CENTROID_POINT_KEY, now));
    }
  }

  const purged = await withSystem(pool, async (tx) => {
    const result = await tx.query(
      `DELETE FROM weather_snapshots
        WHERE date < ($1::timestamptz AT TIME ZONE 'UTC')::date - $2::int`,
      [now, WEATHER_RETENTION_DAYS],
    );
    return result.rowCount ?? 0;
  });
  return { destinations: plans.length, forecasts, marine, failed, purged, events };
}
