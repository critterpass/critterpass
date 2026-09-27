/**
 * `weather.refresh` for a Bali trip under way, answered from recorded WeatherAPI.com responses: the
 * centroid's hourly days are stored with Mount Batur's carried up by the lapse rate, sea conditions
 * land on the centroid rows because the plan has a boat trip, nothing is refetched before it is due,
 * and a failed refresh keeps the last snapshot while marking it checked (stale), never dropping it.
 */
import { withSystem } from '@cp/db';
import { isWeatherStale, weatherSnapshotBodySchema } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { selectWeatherPlans } from '../../src/travel-data/weather-points';
import { refreshWeather, type WeatherSource } from '../../src/travel-data/weather-refresh';
import { fetchForecast, fetchMarine } from '../../src/travel-data/weatherapi-client';
import {
  insertCrew,
  insertUser,
  silentLogger,
  startNotifyDb,
  type NotifyDb,
} from '../notify-fixtures';
import {
  insertLiveDestinations,
  insertTripWithPlan,
  RECORDED_WEATHER_ROUTES,
  recordedHttp,
  WEATHERAPI_FIXTURES,
} from './travel-fixtures';

let db: NotifyDb;
let bali: string;
const NOW = new Date('2026-09-28T00:00:00Z');
const MINUTE = 60_000;

function recordedSource(routes = RECORDED_WEATHER_ROUTES) {
  const recorded = recordedHttp(WEATHERAPI_FIXTURES, routes);
  const source: WeatherSource = {
    forecast: (query, signal) => fetchForecast(recorded.http, { key: 'test-key' }, query, signal),
    marine: (query, signal) => fetchMarine(recorded.http, { key: 'test-key' }, query, signal),
  };
  return { source, urls: recorded.urls };
}

beforeAll(async () => {
  db = await startNotifyDb();
  bali = (await insertLiveDestinations(db.pool))['bali'] ?? '';
  const traveller = await insertUser(db.pool);
  const crewId = await insertCrew(db.pool, [traveller]);
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Campuhan Ridge Walk', 'nature', -8.5031, 115.2544) RETURNING id`,
    [bali],
  );
  await insertTripWithPlan(db.pool, {
    crewId,
    destinationId: bali,
    status: 'in_trip',
    items: [
      {
        category: 'hike',
        isOutdoor: true,
        startsAt: new Date(NOW.getTime() + 20 * 60 * MINUTE),
        poiId: rows[0]?.id ?? '',
      },
      { category: 'boat', isOutdoor: true, startsAt: new Date(NOW.getTime() + 30 * 60 * MINUTE) },
    ],
  });
}, 240_000);

afterAll(async () => {
  await db.stop();
});

async function snapshots() {
  const { rows } = await db.pool.query<{
    point_key: string;
    date: string;
    elevation_m: number | null;
    hourly: unknown;
    marine: { hours: { wave_m: number }[] } | null;
    fetched_at: Date;
    checked_at: Date;
  }>(
    `SELECT point_key, date::text, elevation_m, hourly, marine, fetched_at, checked_at
       FROM weather_snapshots WHERE destination_id = $1 ORDER BY point_key, date`,
    [bali],
  );
  return rows;
}

describe('selectWeatherPlans', () => {
  it('finds the running Bali trip, its outdoor item soon, and its boat item under way', async () => {
    const plans = await withSystem(db.pool, (tx) => selectWeatherPlans(tx, NOW));
    expect(plans).toEqual([
      expect.objectContaining({
        destinationId: bali,
        gridPoints: [],
        outdoorSoon: true,
        marineNeeded: true,
        marineLive: true,
      }),
    ]);
  });
});

describe('refreshWeather', () => {
  it('stores the hourly days, the summit carried up, and the sea on the centroid rows', async () => {
    const { source, urls } = recordedSource();
    const report = await refreshWeather({
      pool: db.pool,
      source,
      logger: silentLogger,
      forecastDays: 3,
      marineDays: 1,
      now: NOW,
    });
    expect(report).toMatchObject({ destinations: 1, forecasts: 1, marine: 1, failed: 0 });
    expect(urls.map((url) => url.pathname)).toEqual(['/v1/forecast.json', '/v1/marine.json']);

    const rows = await snapshots();
    expect(rows.map((row) => [row.point_key, row.date])).toEqual([
      ['centroid', '2026-09-28'],
      ['centroid', '2026-09-29'],
      ['centroid', '2026-09-30'],
      ['summit:mount-batur', '2026-09-28'],
      ['summit:mount-batur', '2026-09-29'],
      ['summit:mount-batur', '2026-09-30'],
    ]);
    const centroid = weatherSnapshotBodySchema.parse(rows[0]?.hourly);
    const summit = weatherSnapshotBodySchema.parse(rows[3]?.hourly);
    expect(centroid.hours).toHaveLength(24);
    expect(rows[3]?.elevation_m).toBe(1717);
    // 1,517 m above the Ubud reference: about 9.9 °C cooler, rain unchanged.
    expect(summit.hours[0]?.temp_c).toBe(11.1);
    expect(summit.hours[0]?.chance_of_rain).toBe(centroid.hours[0]?.chance_of_rain);
    expect(rows[0]?.marine?.hours[0]?.wave_m).toBe(0.1);
    expect(rows[1]?.marine).toBeNull();
  });

  it('asks nothing again before a point is due', async () => {
    const { source, urls } = recordedSource();
    const report = await refreshWeather({
      pool: db.pool,
      source,
      logger: silentLogger,
      forecastDays: 3,
      marineDays: 1,
      now: new Date(NOW.getTime() + 5 * MINUTE),
    });
    expect(report).toMatchObject({ forecasts: 0, marine: 0, failed: 0 });
    expect(urls).toHaveLength(0);
  });

  it('keeps the last snapshot, marked stale, when the next refresh fails', async () => {
    const later = new Date(NOW.getTime() + 61 * MINUTE);
    const { source } = recordedSource([
      { path: '/v1/forecast.json', params: {}, file: 'error-invalid-key-401.json', status: 401 },
      { path: '/v1/marine.json', params: {}, file: 'error-invalid-key-401.json', status: 401 },
    ]);
    const report = await refreshWeather({
      pool: db.pool,
      source,
      logger: silentLogger,
      forecastDays: 3,
      marineDays: 1,
      now: later,
    });
    expect(report).toMatchObject({ forecasts: 0, failed: 2 });
    const rows = await snapshots();
    const centroid = rows.find((row) => row.point_key === 'centroid');
    expect(centroid?.fetched_at.getTime()).toBe(NOW.getTime());
    expect(centroid?.checked_at.getTime()).toBe(later.getTime());
    expect(isWeatherStale(centroid!.fetched_at, centroid!.checked_at, later)).toBe(true);
    expect(weatherSnapshotBodySchema.safeParse(centroid?.hourly).success).toBe(true);
  });
});
