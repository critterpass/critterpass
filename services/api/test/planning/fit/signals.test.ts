import { describe, expect, it } from 'vitest';

import { forecastByDate, rainFor } from '../../../src/planning/fit/signals/climate';
import { crowdWeeks, monthFactors } from '../../../src/planning/fit/signals/crowds';

const flat = (level: number) => Array.from({ length: 24 }, () => level);
const POI = '00000000-0000-4000-8000-000000000301';

describe('crowd signals', () => {
  it('quotes what crews saw over an approved editorial week, never an unapproved one', () => {
    const rows = [
      { poi_id: POI, dow: 6, hourly: flat(30), source: 'editorial', approved_at: new Date() },
      { poi_id: POI, dow: 6, hourly: flat(80), source: 'visits', approved_at: null },
      { poi_id: POI, dow: 0, hourly: flat(30), source: 'editorial', approved_at: null },
    ];
    const week = crowdWeeks(rows).get(POI);
    expect(week?.source).toBe('visits');
    expect(week?.week[6]).toEqual(flat(80));
    expect(week?.week[0]).toBeNull();
    const unapproved = crowdWeeks([{ ...rows[2]!, dow: 3 }]);
    expect(unapproved.has(POI)).toBe(false);
  });

  it('scales a month by its crowd index against the average month, within limits', () => {
    const factors = monthFactors([
      { month: 1, crowd_index: 20 },
      { month: 7, crowd_index: 90 },
      { month: 10, crowd_index: 40 },
    ]);
    expect(factors.get(10)).toBeCloseTo(40 / 50);
    expect(factors.get(7)).toBe(1.4);
    expect(factors.get(1)).toBe(0.6);
    expect(monthFactors([]).size).toBe(0);
  });
});

describe('rain signals', () => {
  const october = Array.from({ length: 24 }, (_, hour) => (hour >= 13 && hour <= 17 ? 55 : 10));
  const normals = new Map([[10, october]]);
  const forecast = new Map([['2026-10-05', flat(80)]]);

  it('a forecast inside three days overrides the usual chance', () => {
    expect(rainFor('2026-10-05', '2026-10-04', forecast, normals)).toEqual({
      hourly: flat(80),
      source: 'forecast',
    });
  });

  it('past the horizon, or with no forecast for the date, the usual chance for the month', () => {
    const later = new Map([['2026-10-09', flat(80)]]);
    expect(rainFor('2026-10-09', '2026-10-04', later, normals)?.source).toBe('normals');
    expect(rainFor('2026-10-06', '2026-10-04', forecast, normals)).toEqual({
      hourly: october,
      source: 'normals',
    });
    expect(rainFor('2026-11-06', '2026-10-04', forecast, normals)).toBeNull();
  });

  it('groups forecast hours into whole local days', () => {
    const hours = Array.from({ length: 30 }, (_, index) => ({
      at: new Date(Date.UTC(2026, 9, 4, 16 + index)).toISOString(),
      temp_c: 25,
      chance_of_rain: index,
      precip_mm: 0,
      wind_kph: 5,
      gust_kph: 8,
      uv: 3,
      code: 1000,
      is_day: true,
    }));
    const days = forecastByDate(hours, 'Asia/Makassar');
    expect([...days.keys()]).toEqual(['2026-10-05']);
    expect(days.get('2026-10-05')?.[0]).toBe(0);
    expect(days.get('2026-10-05')?.[23]).toBe(23);
  });
});
