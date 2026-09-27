import { readFileSync } from 'node:fs';
import path from 'node:path';

import { weatherSnapshotBodySchema } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { fetchForecast, mapForecast, mapMarine } from '../../src/travel-data/weatherapi-client';
import { recordedHttp, WEATHERAPI_FIXTURES } from './travel-fixtures';

const load = (file: string): unknown =>
  JSON.parse(readFileSync(path.join(WEATHERAPI_FIXTURES, file), 'utf8'));

describe('WeatherAPI.com forecast mapping (recorded Ubud forecast)', () => {
  const forecast = mapForecast(load('forecast-bali-ubud-3d.json'));

  it('keeps one validated snapshot per local date with 24 hourly instants', () => {
    expect(forecast.tz).toBe('Asia/Makassar');
    expect([...forecast.days.keys()]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30']);
    for (const body of forecast.days.values()) {
      expect(weatherSnapshotBodySchema.safeParse(body).success).toBe(true);
      expect(body.hours).toHaveLength(24);
    }
    const first = forecast.days.get('2026-09-28');
    expect(first?.hours[0]).toMatchObject({
      at: '2026-09-27T16:00:00.000Z',
      temp_c: 21,
      chance_of_rain: 14,
      code: 1000,
      is_day: false,
    });
    expect(first?.day).toMatchObject({ max_temp_c: 29.9, chance_of_rain: 12, uv: 12.7 });
  });
});

describe('WeatherAPI.com marine mapping (recorded Padang Bai marine)', () => {
  it('maps waves, swell, sea temperature and tides with local tide times as instants', () => {
    const marine = mapMarine(load('marine-bali-padang-bai-1d.json'));
    const day = marine.get('2026-09-28');
    expect(day?.hours[0]).toEqual({
      at: '2026-09-27T16:00:00.000Z',
      wave_m: 0.1,
      swell_m: 1.5,
      swell_period_s: 16.6,
      water_temp_c: 26.9,
    });
    expect(day?.tides?.[0]).toEqual({
      at: '2026-09-27T21:29:00.000Z',
      height_m: 0.27,
      type: 'low',
    });
  });

  it('leaves sea temperature and tides null on plans that do not return them', () => {
    const raw = load('marine-bali-padang-bai-1d.json') as {
      forecast: {
        forecastday: { day: Record<string, unknown>; hour: Record<string, unknown>[] }[];
      };
    };
    // Lower plans omit these two fields; strip them from the recorded body to read it that way.
    for (const day of raw.forecast.forecastday) {
      delete day.day['tides'];
      for (const hour of day.hour) delete hour['water_temp_c'];
    }
    const day = mapMarine(raw).get('2026-09-28');
    expect(day?.tides).toBeNull();
    expect(day?.hours.every((hour) => hour.water_temp_c === null)).toBe(true);
  });
});

describe('WeatherAPI.com errors', () => {
  it('surfaces the recorded invalid-key answer as a non-retryable 401', async () => {
    const { http, audits } = recordedHttp(WEATHERAPI_FIXTURES, [
      { path: '/v1/forecast.json', params: {}, file: 'error-invalid-key-401.json', status: 401 },
    ]);
    await expect(
      fetchForecast(http, { key: 'invalid-key' }, { lat: -8.5, lng: 115.26, days: 1 }),
    ).rejects.toMatchObject({ status: 401, retryable: false });
    expect(audits).toEqual([
      expect.objectContaining({
        supplier: 'weatherapi',
        endpoint: 'forecast',
        outcome: 'http_error',
      }),
    ]);
  });
});
