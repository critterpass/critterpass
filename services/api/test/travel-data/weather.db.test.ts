/**
 * `/v1/weather`, `/v1/weather/marine` and the `weather`/`marine` tools over stored snapshots (rows
 * shaped as `weather.refresh` writes them): the nearest point's hours inside the window, source,
 * attribution and freshness; an elevation carries temperatures up; a failed last refresh reads as
 * stale; far from any stored point the series is empty rather than invented.
 */
import { createToolRegistry } from '@cp/ai';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerTravelDataRoutes } from '../../src/travel-data/routes';
import { registerTravelDataToolExecutors } from '../../src/travel-data/tool-executors';
import type { MarineSeries, WeatherSeries } from '../../src/travel-data/weather-read';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';
import { seedLiveDestinations } from './travel-seed';

let harness: CommandDoorsHarness;
const HOUR = 3_600_000;
const START = Date.parse('2026-10-01T16:00:00Z'); // 2026-10-02 00:00 in Bali

function day(offsetHours: number) {
  const hours = Array.from({ length: 24 }, (_, index) => ({
    at: new Date(START + (offsetHours + index) * HOUR).toISOString(),
    temp_c: 24 + (index % 6),
    chance_of_rain: index >= 14 && index <= 17 ? 70 : 10,
    precip_mm: index >= 14 && index <= 17 ? 2.1 : 0,
    wind_kph: 8,
    gust_kph: 14,
    uv: index > 6 && index < 18 ? 8 : 0,
    code: index >= 14 && index <= 17 ? 1063 : 1000,
    is_day: index > 5 && index < 19,
  }));
  return {
    day: { max_temp_c: 29, min_temp_c: 24, chance_of_rain: 70, precip_mm: 8.4, uv: 11, code: 1063 },
    hours,
    alerts: [
      {
        kind: 'Heavy rain',
        severity: 'Moderate',
        headline: 'Heavy rain in the afternoon',
        from: new Date(START + 14 * HOUR).toISOString(),
        to: new Date(START + 18 * HOUR).toISOString(),
      },
    ],
  };
}

const MARINE = {
  hours: Array.from({ length: 24 }, (_, index) => ({
    at: new Date(START + index * HOUR).toISOString(),
    wave_m: index >= 12 ? 2.5 : 0.8,
    swell_m: 1.5,
    swell_period_s: 14,
    water_temp_c: null,
  })),
  tides: null,
};

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerTravelDataRoutes(app, deps),
  );
  const bali = (await seedLiveDestinations(harness.pool))['bali'];
  const fetched = new Date(Date.now() - HOUR);
  await withSystem(harness.pool, (tx) =>
    tx.query(
      `INSERT INTO weather_snapshots (destination_id, point_key, lat, lng, elevation_m, date, hourly,
         marine, marine_fetched_at, source, fetched_at, checked_at)
       VALUES ($1, 'centroid', -8.5069, 115.2625, 200, '2026-10-02', $2, $3, $4, 'weatherapi', $4, $4),
              ($1, 'centroid', -8.5069, 115.2625, 200, '2026-10-03', $5, NULL, NULL, 'weatherapi', $4, $6)`,
      [
        bali,
        JSON.stringify(day(0)),
        JSON.stringify(MARINE),
        fetched,
        JSON.stringify(day(24)),
        new Date(),
      ],
    ),
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function get<T>(path: string): Promise<{ status: number; body: T }> {
  const me = await harness.signInAnonymously();
  const response = await harness.request(path, { headers: { cookie: me.cookie } });
  return { status: response.status, body: (await response.json()) as T };
}

const WINDOW = 'from=2026-10-02T06:00:00%2B08:00&to=2026-10-02T11:00:00%2B08:00';

describe('GET /v1/weather', () => {
  it("serves the nearest point's hours in the window with source, attribution and seen time", async () => {
    const { status, body } = await get<WeatherSeries>(`/v1/weather?lat=-8.51&lng=115.26&${WINDOW}`);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      source: 'weatherapi',
      attribution: { text: 'Powered by WeatherAPI.com', url: 'https://www.weatherapi.com/' },
      point: { key: 'centroid', elevation_m: 200 },
      stale: false,
    });
    expect(body.fetched_at).not.toBeNull();
    expect(body.hourly.map((hour) => hour.at)).toEqual(
      Array.from({ length: 6 }, (_, index) => new Date(START + (6 + index) * HOUR).toISOString()),
    );
    expect(body.alerts).toHaveLength(1);
  });

  it('carries temperatures to a summit height', async () => {
    const { body } = await get<WeatherSeries>(
      `/v1/weather?lat=-8.51&lng=115.26&${WINDOW}&elevation_m=1717`,
    );
    expect(body.elevation_adjusted_to).toBe(1717);
    expect(body.hourly[0]?.temp_c).toBe(14.1);
  });

  it('flags a point whose last refresh failed as stale', async () => {
    const { body } = await get<WeatherSeries>(
      '/v1/weather?lat=-8.51&lng=115.26&from=2026-10-03T06:00:00%2B08:00&to=2026-10-03T08:00:00%2B08:00',
    );
    expect(body.stale).toBe(true);
    expect(body.hourly.length).toBeGreaterThan(0);
  });

  it('returns an empty series far from any stored point, and validates the window', async () => {
    const { body } = await get<WeatherSeries>(`/v1/weather?lat=35.0&lng=135.7&${WINDOW}`);
    expect(body).toMatchObject({ source: null, point: null, hourly: [], stale: false });
    const reversed = await get(
      '/v1/weather?lat=-8.5&lng=115.2&from=2026-10-03T00:00:00Z&to=2026-10-02T00:00:00Z',
    );
    expect(reversed.status).toBe(422);
  });
});

describe('GET /v1/weather/marine', () => {
  it("serves the coastal point's waves and leaves sea temperature and tides null", async () => {
    const { body } = await get<MarineSeries>(
      '/v1/weather/marine?lat=-8.53&lng=115.51&from=2026-10-02T11:00:00%2B08:00&to=2026-10-02T13:00:00%2B08:00',
    );
    expect(body).toMatchObject({ source: 'weatherapi', tides: null, stale: false });
    expect(body.hourly.map((hour) => [hour.wave_m, hour.water_temp_c])).toEqual([
      [0.8, null],
      [2.5, null],
      [2.5, null],
    ]);
  });
});

describe('weather and marine tools', () => {
  it('return verbatim series in the tool shapes', async () => {
    const registry = createToolRegistry();
    registerTravelDataToolExecutors(registry, harness.pool);
    const me = await harness.signInAnonymously();
    const context = { uid: me.uid, tripId: null, caller: 'C', route: 'guide.chat' } as const;
    const input = {
      lat: -8.51,
      lng: 115.26,
      from: '2026-10-02T14:00:00+08:00',
      to: '2026-10-02T15:00:00+08:00',
    };
    const weather = await registry.execute({ id: 'w', name: 'weather', input }, context);
    expect(weather).toMatchObject({
      ok: true,
      output: {
        hourly: [
          { temp_c: 26, chance_of_rain: 70, code: '1063' },
          { temp_c: 27, chance_of_rain: 70, code: '1063' },
        ],
        alerts: [{ kind: 'Heavy rain', severity: 'Moderate' }],
      },
    });
    const marine = await registry.execute(
      { id: 'm', name: 'marine', input: { ...input, lat: -8.53, lng: 115.51 } },
      context,
    );
    expect(marine).toMatchObject({
      ok: true,
      output: {
        hourly: [
          { wave_m: 2.5, sea_temp_c: null },
          { wave_m: 2.5, sea_temp_c: null },
        ],
      },
    });
  });
});
