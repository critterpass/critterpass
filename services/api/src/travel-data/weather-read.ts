/**
 * Weather and marine reads for `/v1/weather`, `/v1/weather/marine` and the `weather`/`marine`
 * tools: the nearest stored forecast point to the request (never a live supplier call), its hours
 * inside the requested window, when it was fetched and last checked, and whether it is stale. An
 * `elevation_m` carries temperatures to that height by the lapse rate when the point's own height
 * is known. No stored point nearby = an empty series, never an invented forecast.
 */
import {
  adjustTempForElevation,
  isWeatherStale,
  marineSnapshotBodySchema,
  TRAVEL_DESTINATIONS,
  MARINE_POINT_RADIUS_KM,
  WEATHER_ATTRIBUTION,
  WEATHER_POINT_RADIUS_KM,
  weatherSnapshotBodySchema,
  type MarineHour,
  type Tide,
  type WeatherAlert,
  type WeatherDay,
  type WeatherHour,
} from '@cp/domain';
import type pg from 'pg';

export interface WeatherWindow {
  readonly lat: number;
  readonly lng: number;
  readonly from: Date;
  readonly to: Date;
  readonly elevationM?: number;
  readonly now?: Date;
}

interface PointRow {
  readonly destination_id: string;
  readonly slug: string;
  readonly point_key: string;
  readonly lat: number;
  readonly lng: number;
  readonly elevation_m: number | null;
}

interface SnapshotRow {
  readonly date: string;
  readonly hourly: unknown;
  readonly marine: unknown;
  readonly fetched_at: Date;
  readonly checked_at: Date;
  readonly marine_fetched_at: Date | null;
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * rad) / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLng - aLng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

async function storedPoints(tx: pg.PoolClient): Promise<PointRow[]> {
  const { rows } = await tx.query<PointRow>(
    `SELECT DISTINCT ON (w.destination_id, w.point_key)
            w.destination_id, d.slug, w.point_key, w.lat, w.lng, w.elevation_m
       FROM weather_snapshots w JOIN destinations d ON d.id = w.destination_id
      ORDER BY w.destination_id, w.point_key, w.date DESC`,
  );
  return rows;
}

async function snapshotRows(tx: pg.PoolClient, point: PointRow, window: WeatherWindow) {
  const { rows } = await tx.query<SnapshotRow>(
    `SELECT date::text, hourly, marine, fetched_at, checked_at, marine_fetched_at
       FROM weather_snapshots
      WHERE destination_id = $1 AND point_key = $2
        AND date BETWEEN ($3::timestamptz AT TIME ZONE 'UTC')::date - 1
                     AND ($4::timestamptz AT TIME ZONE 'UTC')::date + 1
      ORDER BY date`,
    [point.destination_id, point.point_key, window.from, window.to],
  );
  return rows;
}

const inWindow = (at: string, window: WeatherWindow) => {
  const time = Date.parse(at);
  return time >= window.from.getTime() && time <= window.to.getTime();
};

function freshness(rows: readonly SnapshotRow[], now: Date, marine = false) {
  const fetched = rows
    .map((row) => (marine ? row.marine_fetched_at : row.fetched_at))
    .filter((value): value is Date => value !== null);
  if (fetched.length === 0) return { fetched_at: null, checked_at: null, stale: false };
  const fetchedAt = new Date(Math.min(...fetched.map((date) => date.getTime())));
  const checkedAt = new Date(Math.max(...rows.map((row) => row.checked_at.getTime())));
  return {
    fetched_at: fetchedAt.toISOString(),
    checked_at: checkedAt.toISOString(),
    stale: isWeatherStale(fetchedAt, checkedAt, now),
  };
}

export interface WeatherSeries {
  readonly source: 'weatherapi' | null;
  readonly attribution: typeof WEATHER_ATTRIBUTION;
  readonly point: {
    readonly key: string;
    readonly lat: number;
    readonly lng: number;
    readonly elevation_m: number | null;
    readonly distance_km: number;
  } | null;
  readonly elevation_adjusted_to: number | null;
  readonly fetched_at: string | null;
  readonly checked_at: string | null;
  readonly stale: boolean;
  readonly hourly: readonly WeatherHour[];
  readonly days: readonly (WeatherDay & { readonly date: string })[];
  readonly alerts: readonly WeatherAlert[];
}

export async function readWeather(
  tx: pg.PoolClient,
  window: WeatherWindow,
): Promise<WeatherSeries> {
  const now = window.now ?? new Date();
  const nearest = (await storedPoints(tx))
    .map((point) => ({ point, km: distanceKm(window.lat, window.lng, point.lat, point.lng) }))
    .filter((entry) => entry.km <= WEATHER_POINT_RADIUS_KM)
    .sort((a, b) => a.km - b.km)[0];
  const empty: WeatherSeries = {
    source: null,
    attribution: WEATHER_ATTRIBUTION,
    point: null,
    elevation_adjusted_to: null,
    fetched_at: null,
    checked_at: null,
    stale: false,
    hourly: [],
    days: [],
    alerts: [],
  };
  if (nearest === undefined) return empty;
  const { point } = nearest;
  const allRows = await snapshotRows(tx, point, window);
  // Freshness describes the days that answer the window, not neighbours fetched for padding.
  const answering = allRows.filter((row) =>
    weatherSnapshotBodySchema.parse(row.hourly).hours.some((hour) => inWindow(hour.at, window)),
  );
  const rows = answering.length > 0 ? answering : allRows;
  const bodies = rows.map((row) => ({
    date: row.date,
    body: weatherSnapshotBodySchema.parse(row.hourly),
  }));
  const adjustTo =
    window.elevationM !== undefined && point.elevation_m !== null ? window.elevationM : null;
  const carry = (temp: number) =>
    adjustTo === null || point.elevation_m === null
      ? temp
      : adjustTempForElevation(temp, point.elevation_m, adjustTo);
  const alerts = new Map<string, WeatherAlert>();
  for (const { body } of bodies) {
    for (const alert of body.alerts ?? []) alerts.set(`${alert.kind}|${alert.from}`, alert);
  }
  return {
    ...empty,
    source: 'weatherapi',
    point: {
      key: point.point_key,
      lat: point.lat,
      lng: point.lng,
      elevation_m: point.elevation_m,
      distance_km: Math.round(nearest.km * 10) / 10,
    },
    elevation_adjusted_to: adjustTo,
    ...freshness(rows, now),
    hourly: bodies
      .flatMap(({ body }) => body.hours)
      .filter((hour) => inWindow(hour.at, window))
      .map((hour) => ({ ...hour, temp_c: carry(hour.temp_c) })),
    days: bodies.map(({ date, body }) => ({
      date,
      ...body.day,
      max_temp_c: carry(body.day.max_temp_c),
      min_temp_c: carry(body.day.min_temp_c),
    })),
    alerts: [...alerts.values()],
  };
}

export interface MarineSeries {
  readonly source: 'weatherapi' | null;
  readonly attribution: typeof WEATHER_ATTRIBUTION;
  readonly point: {
    readonly lat: number;
    readonly lng: number;
    readonly distance_km: number;
  } | null;
  readonly fetched_at: string | null;
  readonly checked_at: string | null;
  readonly stale: boolean;
  readonly hourly: readonly MarineHour[];
  readonly tides: readonly Tide[] | null;
}

export async function readMarine(tx: pg.PoolClient, window: WeatherWindow): Promise<MarineSeries> {
  const now = window.now ?? new Date();
  const nearest = (await storedPoints(tx))
    .filter((point) => point.point_key === 'centroid')
    .flatMap((point) => {
      const coast = TRAVEL_DESTINATIONS[point.slug]?.marine;
      return coast === null || coast === undefined
        ? []
        : [{ point, coast, km: distanceKm(window.lat, window.lng, coast.lat, coast.lng) }];
    })
    .filter((entry) => entry.km <= MARINE_POINT_RADIUS_KM)
    .sort((a, b) => a.km - b.km)[0];
  const empty: MarineSeries = {
    source: null,
    attribution: WEATHER_ATTRIBUTION,
    point: null,
    fetched_at: null,
    checked_at: null,
    stale: false,
    hourly: [],
    tides: null,
  };
  if (nearest === undefined) return empty;
  const rows = (await snapshotRows(tx, nearest.point, window)).filter((row) => row.marine !== null);
  if (rows.length === 0) return empty;
  const bodies = rows.map((row) => marineSnapshotBodySchema.parse(row.marine));
  const tides = bodies.some((body) => body.tides !== null)
    ? bodies.flatMap((body) => body.tides ?? []).filter((tide) => inWindow(tide.at, window))
    : null;
  return {
    source: 'weatherapi',
    attribution: WEATHER_ATTRIBUTION,
    point: {
      lat: nearest.coast.lat,
      lng: nearest.coast.lng,
      distance_km: Math.round(nearest.km * 10) / 10,
    },
    ...freshness(rows, now, true),
    hourly: bodies.flatMap((body) => body.hours).filter((hour) => inWindow(hour.at, window)),
    tides,
  };
}
