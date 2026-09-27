import { describe, expect, it } from 'vitest';

import type { MarineHour, WeatherHour } from '../../src/travel-data';
import { hazardImpact, watchForecast, type WatchedItem } from '../../src/travel-data';

const BASE = Date.parse('2026-10-02T00:00:00Z');
const at = (hour: number) => new Date(BASE + hour * 3_600_000).toISOString();

function weather(rain: (hour: number) => number, temp: (hour: number) => number = () => 26) {
  return Array.from({ length: 24 }, (_, hour): WeatherHour => ({
    at: at(hour),
    temp_c: temp(hour),
    chance_of_rain: rain(hour),
    precip_mm: 0,
    wind_kph: 8,
    gust_kph: 12,
    uv: 3,
    code: 1000,
    is_day: true,
  }));
}

function marine(wave: (hour: number) => number) {
  return Array.from({ length: 24 }, (_, hour): MarineHour => ({
    at: at(hour),
    wave_m: wave(hour),
    swell_m: 1,
    swell_period_s: 12,
    water_temp_c: null,
  }));
}

const hike: WatchedItem = {
  stable_id: '0192f000-0000-7000-8000-000000000001',
  starts_at: at(6),
  ends_at: at(9),
  local_date: '2026-10-02',
  is_outdoor: true,
  is_marine: false,
};
const boat: WatchedItem = {
  stable_id: '0192f000-0000-7000-8000-000000000002',
  starts_at: at(13),
  ends_at: at(16),
  local_date: '2026-10-02',
  is_outdoor: true,
  is_marine: true,
};
const dinner: WatchedItem = {
  stable_id: '0192f000-0000-7000-8000-000000000003',
  starts_at: at(19),
  ends_at: null,
  local_date: '2026-10-02',
  is_outdoor: false,
  is_marine: false,
};

const dry = weather(() => 10);
const calm = marine(() => 0.8);

describe('watchForecast', () => {
  it('reports rain newly reaching 50 % during an outdoor item', () => {
    const rainyMorning = weather((hour) => (hour >= 7 && hour <= 8 ? 65 : 10));
    const result = watchForecast(
      { previousWeather: dry, nextWeather: rainyMorning, previousMarine: calm, nextMarine: calm },
      [hike, boat, dinner],
    );
    expect(result.changes).toEqual([
      { item_stable_id: hike.stable_id, reason: 'rain', date: '2026-10-02' },
    ]);
    expect(result.impact).toBe(50);
  });

  it('reports nothing for an identical rerun or a forecast already past the threshold', () => {
    const rainy = weather(() => 80);
    const same = {
      previousWeather: rainy,
      nextWeather: rainy,
      previousMarine: calm,
      nextMarine: calm,
    };
    expect(watchForecast(same, [hike, boat]).changes).toEqual([]);
    const wetter = weather(() => 95);
    expect(watchForecast({ ...same, nextWeather: wetter }, [hike, boat]).changes).toEqual([]);
  });

  it('ignores rain outside the item and at indoor items', () => {
    const rainyNight = weather((hour) => (hour >= 19 ? 90 : 10));
    expect(
      watchForecast(
        { previousWeather: dry, nextWeather: rainyNight, previousMarine: calm, nextMarine: calm },
        [hike, dinner],
      ).changes,
    ).toEqual([]);
  });

  it('reports waves newly reaching 2 m during a boat item', () => {
    const rough = marine((hour) => (hour >= 14 ? 2.5 : 0.8));
    const result = watchForecast(
      { previousWeather: dry, nextWeather: dry, previousMarine: calm, nextMarine: rough },
      [hike, boat],
    );
    expect(result.changes).toEqual([
      { item_stable_id: boat.stable_id, reason: 'waves', date: '2026-10-02' },
    ]);
  });

  it('reports heat and frost extremes', () => {
    const hot = weather(
      () => 10,
      (hour) => (hour === 8 ? 36 : 30),
    );
    const freezing = weather(
      () => 10,
      (hour) => (hour === 7 ? -2 : 4),
    );
    const pair = (next: WeatherHour[]) => ({
      previousWeather: dry,
      nextWeather: next,
      previousMarine: calm,
      nextMarine: calm,
    });
    expect(watchForecast(pair(hot), [hike]).changes.map((c) => c.reason)).toEqual(['heat']);
    expect(watchForecast(pair(freezing), [hike]).changes.map((c) => c.reason)).toEqual(['cold']);
  });

  it('treats a first forecast as new information', () => {
    const rainy = weather(() => 70);
    const result = watchForecast(
      { previousWeather: [], nextWeather: rainy, previousMarine: [], nextMarine: calm },
      [hike],
    );
    expect(result.changes.map((change) => change.reason)).toEqual(['rain']);
    expect(result.impact).toBe(100);
  });
});

describe('hazardImpact', () => {
  it('weighs rising levels by height and easing low', () => {
    expect(hazardImpact(1, 2)).toBe(50);
    expect(hazardImpact(null, 4)).toBe(100);
    expect(hazardImpact(3, 2)).toBe(20);
  });
});
