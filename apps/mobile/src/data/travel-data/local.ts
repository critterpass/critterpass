/**
 * Travel-data answers from the synced trip pack (PowerSync `trip_pack`: `weather_snapshots`),
 * shaped exactly like the api's so a hook's callers never care where the answer came from. `null` =
 * nothing synced for the ask, and the hook falls through to the api.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL or a wire value, never copy. */
import {
  adjustTempForElevation,
  isWeatherStale,
  MARINE_POINT_RADIUS_KM,
  marineSnapshotBodySchema,
  TRAVEL_DESTINATIONS,
  WEATHER_ATTRIBUTION,
  WEATHER_POINT_RADIUS_KM,
  weatherSnapshotBodySchema,
} from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import type { MarineResponse, WeatherResponse } from '@cp/domain';

export interface LocalWeatherWindow {
  readonly lat: number;
  readonly lng: number;
  readonly from: Date;
  readonly to: Date;
  readonly elevationM?: number;
}

interface SnapshotRow {
  readonly destination_id: string;
  readonly point_key: string;
  readonly lat: number;
  readonly lng: number;
  readonly elevation_m: number | null;
  readonly date: string;
  readonly hourly: string;
  readonly marine: string | null;
  readonly fetched_at: string;
  readonly checked_at: string;
  readonly marine_fetched_at: string | null;
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((bLat - aLat) * rad) / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(((bLng - aLng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const inWindow = (at: string, window: LocalWeatherWindow) => {
  const time = Date.parse(at);
  return time >= window.from.getTime() && time <= window.to.getTime();
};

async function snapshotRows(db: AbstractPowerSyncDatabase): Promise<SnapshotRow[]> {
  return db.getAll<SnapshotRow>(
    `SELECT destination_id, point_key, lat, lng, elevation_m, date, hourly, marine, fetched_at,
            checked_at, marine_fetched_at
       FROM weather_snapshots ORDER BY date`,
  );
}

function freshness(fetched: readonly string[], checked: readonly string[], now: Date) {
  const fetchedAt = fetched.reduce((a, b) => (a < b ? a : b));
  const checkedAt = checked.reduce((a, b) => (a > b ? a : b));
  return {
    fetched_at: fetchedAt,
    checked_at: checkedAt,
    stale: isWeatherStale(new Date(fetchedAt), new Date(checkedAt), now),
  };
}

export async function readLocalWeather(
  db: AbstractPowerSyncDatabase,
  window: LocalWeatherWindow,
  now: Date,
): Promise<WeatherResponse | null> {
  const rows = await snapshotRows(db);
  const nearest = rows
    .map((row) => ({ row, km: distanceKm(window.lat, window.lng, row.lat, row.lng) }))
    .filter((entry) => entry.km <= WEATHER_POINT_RADIUS_KM)
    .sort((a, b) => a.km - b.km)[0];
  if (nearest === undefined) return null;
  const point = nearest.row;
  const pointRows = rows.filter(
    (row) => row.destination_id === point.destination_id && row.point_key === point.point_key,
  );
  const bodies = pointRows.map((row) => ({
    row,
    body: weatherSnapshotBodySchema.parse(JSON.parse(row.hourly)),
  }));
  const answering = bodies.filter(({ body }) => body.hours.some((h) => inWindow(h.at, window)));
  if (answering.length === 0) return null;
  const adjustTo =
    window.elevationM !== undefined && point.elevation_m !== null ? window.elevationM : null;
  const carry = (temp: number) =>
    adjustTo === null || point.elevation_m === null
      ? temp
      : adjustTempForElevation(temp, point.elevation_m, adjustTo);
  return {
    source: 'weatherapi',
    attribution: WEATHER_ATTRIBUTION,
    point: {
      key: point.point_key,
      lat: point.lat,
      lng: point.lng,
      elevation_m: point.elevation_m,
      distance_km: Math.round(nearest.km * 10) / 10,
    },
    elevation_adjusted_to: adjustTo,
    ...freshness(
      answering.map(({ row }) => row.fetched_at),
      answering.map(({ row }) => row.checked_at),
      now,
    ),
    hourly: answering
      .flatMap(({ body }) => body.hours)
      .filter((hour) => inWindow(hour.at, window))
      .map((hour) => ({ ...hour, temp_c: carry(hour.temp_c) })),
    days: answering.map(({ row, body }) => ({
      date: row.date,
      ...body.day,
      max_temp_c: carry(body.day.max_temp_c),
      min_temp_c: carry(body.day.min_temp_c),
    })),
    alerts: answering.flatMap(({ body }) => body.alerts ?? []),
  };
}

export async function readLocalMarine(
  db: AbstractPowerSyncDatabase,
  window: LocalWeatherWindow,
  now: Date,
): Promise<MarineResponse | null> {
  const rows = (await snapshotRows(db)).filter(
    (row) => row.point_key === 'centroid' && row.marine !== null && row.marine_fetched_at !== null,
  );
  const slugs = await db.getAll<{ id: string; slug: string }>('SELECT id, slug FROM destinations');
  const coastOf = new Map(
    slugs.flatMap((d) => {
      const coast = TRAVEL_DESTINATIONS[d.slug]?.marine;
      return coast === null || coast === undefined ? [] : [[d.id, coast] as const];
    }),
  );
  const candidates = rows.flatMap((row) => {
    const coast = coastOf.get(row.destination_id);
    return coast === undefined
      ? []
      : [{ row, coast, km: distanceKm(window.lat, window.lng, coast.lat, coast.lng) }];
  });
  const nearest = candidates
    .filter((c) => c.km <= MARINE_POINT_RADIUS_KM)
    .sort((a, b) => a.km - b.km)[0];
  if (nearest === undefined) return null;
  const mine = candidates
    .filter((c) => c.row.destination_id === nearest.row.destination_id)
    .map((c) => ({
      row: c.row,
      body: marineSnapshotBodySchema.parse(JSON.parse(c.row.marine ?? '{}')),
    }));
  const hourly = mine.flatMap(({ body }) => body.hours).filter((h) => inWindow(h.at, window));
  if (hourly.length === 0) return null;
  const tides = mine.some(({ body }) => body.tides !== null)
    ? mine.flatMap(({ body }) => body.tides ?? []).filter((tide) => inWindow(tide.at, window))
    : null;
  return {
    source: 'weatherapi',
    attribution: WEATHER_ATTRIBUTION,
    point: {
      lat: nearest.coast.lat,
      lng: nearest.coast.lng,
      distance_km: Math.round(nearest.km * 10) / 10,
    },
    ...freshness(
      mine.map(({ row }) => row.marine_fetched_at ?? row.fetched_at),
      mine.map(({ row }) => row.checked_at),
      now,
    ),
    hourly,
    tides,
  };
}
