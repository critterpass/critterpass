import { isPlanChangingEscalation, type MarineHour, type WeatherHour } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { scoreWatch, type WatchSubject } from '../index';

const NOW = new Date('2026-10-14T00:00:00Z');
const boat: WatchSubject = {
  stableId: '0190f0a0-0000-7000-a000-000000000001',
  title: 'Nusa Penida boat',
  day: '2026-10-16',
  startsAt: new Date('2026-10-16T01:00:00Z'),
  endsAt: new Date('2026-10-16T05:00:00Z'),
  outdoor: true,
  marine: true,
  summit: false,
};
const walk: WatchSubject = {
  ...boat,
  stableId: '0190f0a0-0000-7000-a000-000000000002',
  title: 'Ridge walk',
  marine: false,
};

function weather(at: string, fields: Partial<WeatherHour> = {}): WeatherHour {
  return {
    at,
    temp_c: 29,
    chance_of_rain: 10,
    precip_mm: 0,
    wind_kph: 12,
    gust_kph: 18,
    uv: 7,
    code: 1000,
    is_day: true,
    ...fields,
  };
}
const sea = (at: string, wave: number): MarineHour =>
  ({ at, wave_m: wave, swell_m: wave, swell_period_s: 9, water_temp_c: 28 });

const calm = {
  weather: [weather('2026-10-16T02:00:00Z')],
  marine: [sea('2026-10-16T02:00:00Z', 0.8)],
  volcanoLevel: null,
  crowd: null,
};
const rough = {
  weather: [weather('2026-10-16T02:00:00Z', { wind_kph: 28, gust_kph: 35 })],
  marine: [sea('2026-10-16T02:00:00Z', 2.5)],
  volcanoLevel: null,
  crowd: null,
};

describe('scoreWatch', () => {
  it('puts rough seas within three days on PLAN B with the numbers the copy may show', () => {
    const verdict = scoreWatch(boat, rough, NOW);
    expect(verdict).toMatchObject({
      kind: 'marine',
      status: 'plan_b',
      reasons: ['waves', 'wind'],
      facts: { waves_m: '2.5', wind_kmh: 35 },
      titleTemplate: 'Nusa Penida boat · waves 2.5 m',
    });
    expect(verdict?.detailTemplate).toBe(
      'Forecast shows waves 2.5 m, wind 35 km/h. The harbour might close.',
    );
    expect(verdict?.score).toBeGreaterThanOrEqual(70);
  });

  it('only watches the same seas when the boat is further out than the forecast is sure', () => {
    expect(scoreWatch(boat, rough, new Date('2026-10-12T00:00:00Z'))?.status).toBe('watching');
  });

  it('keeps calm seas on GO and a near miss on WATCHING', () => {
    expect(scoreWatch(boat, calm, NOW)?.status).toBe('go');
    const near = { ...calm, marine: [sea('2026-10-16T02:00:00Z', 1.6)] };
    expect(scoreWatch(boat, near, NOW)?.status).toBe('watching');
  });

  it('reads rain on outdoor items only, and wind at sea or on a summit only', () => {
    const wet = {
      ...calm,
      weather: [
        weather('2026-10-16T02:00:00Z', { chance_of_rain: 70, wind_kph: 40, gust_kph: 45 }),
      ],
    };
    expect(scoreWatch(walk, wet, NOW)).toMatchObject({ status: 'plan_b', reasons: ['rain'] });
    expect(scoreWatch({ ...walk, outdoor: false }, wet, NOW)).toBeNull();
  });

  it('watches a volcano at level 3 for a summit and never lets crowds alone past WATCHING', () => {
    const summit = { ...walk, outdoor: false, summit: true };
    expect(scoreWatch(summit, { ...calm, weather: [], volcanoLevel: 3 }, NOW)).toMatchObject({
      kind: 'volcano',
      status: 'plan_b',
    });
    expect(
      scoreWatch({ ...walk, outdoor: false }, { ...calm, weather: [], crowd: 100 }, NOW)?.status,
    ).toBe('watching');
  });

  it('keeps a decided item SET until the risk is gone', () => {
    expect(scoreWatch(boat, rough, NOW, 'set')?.status).toBe('set');
    expect(scoreWatch(boat, calm, NOW, 'set')?.status).toBe('go');
  });

  it('escalates to plan-changing exactly once', () => {
    const first = scoreWatch(boat, rough, NOW)?.status ?? 'go';
    expect(isPlanChangingEscalation('watching', first)).toBe(true);
    expect(isPlanChangingEscalation(first, scoreWatch(boat, rough, NOW)?.status ?? 'go')).toBe(
      false,
    );
    expect(isPlanChangingEscalation('set', 'plan_b')).toBe(false);
  });
});
