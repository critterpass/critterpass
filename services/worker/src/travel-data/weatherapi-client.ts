/**
 * WeatherAPI.com client (docs/product-decisions.md: weather and marine from WeatherAPI.com):
 * `forecast.json` (hourly + daily, as many days as the plan allows) and `marine.json` (waves,
 * swell; sea temperature and tides only on Pro+, so both are optional here). Responses are mapped to
 * the stored snapshot shapes in `@cp/domain`, one per local date, with times as instants.
 */
import {
  localSchedule,
  marineSnapshotBodySchema,
  weatherSnapshotBodySchema,
  type MarineSnapshotBody,
  type WeatherAlert,
  type WeatherSnapshotBody,
} from '@cp/domain';
import type { SupplierHttp } from '@cp/suppliers';
import { z } from 'zod';

export const WEATHERAPI_SUPPLIER = 'weatherapi';
const DEFAULT_BASE_URL = 'https://api.weatherapi.com';

const condition = z.object({ code: z.number().int() });

const forecastHourSchema = z.object({
  time_epoch: z.number().int(),
  temp_c: z.number(),
  is_day: z.number().int(),
  condition,
  wind_kph: z.number(),
  gust_kph: z.number(),
  precip_mm: z.number(),
  chance_of_rain: z.number(),
  uv: z.number(),
});

const forecastResponseSchema = z.object({
  location: z.object({ lat: z.number(), lon: z.number(), tz_id: z.string() }),
  forecast: z.object({
    forecastday: z.array(
      z.object({
        date: z.iso.date(),
        day: z.object({
          maxtemp_c: z.number(),
          mintemp_c: z.number(),
          totalprecip_mm: z.number(),
          daily_chance_of_rain: z.number(),
          uv: z.number(),
          condition,
        }),
        hour: z.array(forecastHourSchema),
      }),
    ),
  }),
  alerts: z
    .object({
      alert: z.array(
        z.object({
          event: z.string().optional(),
          severity: z.string().optional(),
          headline: z.string().optional(),
          effective: z.string().optional(),
          expires: z.string().optional(),
        }),
      ),
    })
    .optional(),
});

const marineResponseSchema = z.object({
  location: z.object({ tz_id: z.string() }),
  forecast: z.object({
    forecastday: z.array(
      z.object({
        date: z.iso.date(),
        day: z.object({
          tides: z
            .array(
              z.object({
                tide: z.array(
                  z.object({
                    tide_time: z.string(),
                    tide_height_mt: z.number(),
                    tide_type: z.string(),
                  }),
                ),
              }),
            )
            .optional(),
        }),
        hour: z.array(
          z.object({
            time_epoch: z.number().int(),
            sig_ht_mt: z.number(),
            swell_ht_mt: z.number(),
            swell_period_secs: z.number(),
            water_temp_c: z.number().optional(),
          }),
        ),
      }),
    ),
  }),
});

export interface WeatherApiConfig {
  readonly key: string;
  readonly baseUrl?: string;
}

export interface WeatherPointQuery {
  readonly lat: number;
  readonly lng: number;
  readonly days: number;
}

export interface ForecastDays {
  readonly tz: string;
  readonly days: ReadonlyMap<string, WeatherSnapshotBody>;
  readonly alerts: readonly WeatherAlert[];
}

function url(path: string, config: WeatherApiConfig, params: Record<string, string>): URL {
  const target = new URL(path, config.baseUrl ?? DEFAULT_BASE_URL);
  target.searchParams.set('key', config.key);
  for (const [name, value] of Object.entries(params)) target.searchParams.set(name, value);
  return target;
}

const at = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString();
const coords = (query: WeatherPointQuery) => `${query.lat.toFixed(4)},${query.lng.toFixed(4)}`;

function isoOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function mapForecast(raw: unknown): ForecastDays {
  const body = forecastResponseSchema.parse(raw);
  const alerts: WeatherAlert[] = (body.alerts?.alert ?? []).map((alert) => ({
    kind: alert.event ?? 'weather',
    severity: alert.severity ?? 'unknown',
    headline: alert.headline ?? null,
    from: isoOrNull(alert.effective),
    to: isoOrNull(alert.expires),
  }));
  const days = new Map<string, WeatherSnapshotBody>();
  for (const day of body.forecast.forecastday) {
    days.set(
      day.date,
      weatherSnapshotBodySchema.parse({
        day: {
          max_temp_c: day.day.maxtemp_c,
          min_temp_c: day.day.mintemp_c,
          chance_of_rain: Math.round(day.day.daily_chance_of_rain),
          precip_mm: day.day.totalprecip_mm,
          uv: day.day.uv,
          code: day.day.condition.code,
        },
        hours: day.hour.map((hour) => ({
          at: at(hour.time_epoch),
          temp_c: hour.temp_c,
          chance_of_rain: Math.round(hour.chance_of_rain),
          precip_mm: hour.precip_mm,
          wind_kph: hour.wind_kph,
          gust_kph: hour.gust_kph,
          uv: hour.uv,
          code: hour.condition.code,
          is_day: hour.is_day === 1,
        })),
        alerts,
      }),
    );
  }
  return { tz: body.location.tz_id, days, alerts };
}

export function mapMarine(raw: unknown): ReadonlyMap<string, MarineSnapshotBody> {
  const body = marineResponseSchema.parse(raw);
  const tz = body.location.tz_id;
  const days = new Map<string, MarineSnapshotBody>();
  for (const day of body.forecast.forecastday) {
    const tides = day.day.tides?.flatMap((entry) => entry.tide);
    days.set(
      day.date,
      marineSnapshotBodySchema.parse({
        hours: day.hour.map((hour) => ({
          at: at(hour.time_epoch),
          wave_m: hour.sig_ht_mt,
          swell_m: hour.swell_ht_mt,
          swell_period_s: hour.swell_period_secs,
          water_temp_c: hour.water_temp_c ?? null,
        })),
        tides:
          tides === undefined
            ? null
            : tides.map((tide) => {
                const [date = day.date, time = '00:00'] = tide.tide_time.split(' ');
                return {
                  at: localSchedule({ date, time, tz }).toISOString(),
                  height_m: tide.tide_height_mt,
                  type: tide.tide_type.toLowerCase() === 'high' ? 'high' : 'low',
                };
              }),
      }),
    );
  }
  return days;
}

export async function fetchForecast(
  http: SupplierHttp,
  config: WeatherApiConfig,
  query: WeatherPointQuery,
  signal?: AbortSignal,
): Promise<ForecastDays> {
  const response = await http.request({
    supplier: WEATHERAPI_SUPPLIER,
    endpoint: 'forecast',
    url: url('/v1/forecast.json', config, {
      q: coords(query),
      days: String(query.days),
      aqi: 'no',
      alerts: 'yes',
    }),
    timeoutMs: 20_000,
    ...(signal !== undefined ? { signal } : {}),
  });
  return mapForecast(JSON.parse(response.body));
}

export async function fetchMarine(
  http: SupplierHttp,
  config: WeatherApiConfig,
  query: WeatherPointQuery,
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, MarineSnapshotBody>> {
  const response = await http.request({
    supplier: WEATHERAPI_SUPPLIER,
    endpoint: 'marine',
    url: url('/v1/marine.json', config, { q: coords(query), days: String(query.days) }),
    timeoutMs: 20_000,
    ...(signal !== undefined ? { signal } : {}),
  });
  return mapMarine(JSON.parse(response.body));
}
