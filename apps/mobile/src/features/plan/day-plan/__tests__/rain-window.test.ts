/** The day's rain window: the longest wet run of its hourly forecast, none without a snapshot. */
import { describe, expect, it } from '@jest/globals';

import { instantOnDay } from '@/data/plan/plan-model';

import { rainWindow } from '../weather';

const LAB_TZ = 'Asia/Makassar';
const LAB_DATE = '2026-10-14';

function hour(h: number, chance: number, mm = 0) {
  return {
    at: instantOnDay(LAB_DATE, h * 60, LAB_TZ),
    temp_c: 26,
    chance_of_rain: chance,
    precip_mm: mm,
    wind_kph: 8,
    gust_kph: 12,
    uv: 3,
    code: 1063,
    is_day: true,
  };
}

const forecast = JSON.stringify({
  day: { max_temp_c: 29, min_temp_c: 22, chance_of_rain: 80, precip_mm: 6, uv: 5, code: 1189 },
  hours: [
    hour(9, 70),
    hour(10, 20),
    hour(12, 30),
    hour(13, 85, 3),
    hour(14, 90, 4),
    hour(15, 10),
    hour(18, 40, 1.2),
  ],
});

describe('rain window', () => {
  it('takes the longest wet run of the day', () => {
    expect(rainWindow(forecast, LAB_TZ, LAB_DATE)).toEqual({
      kind: 'rain',
      start: 13 * 60,
      end: 15 * 60,
    });
  });

  it('is dry or unavailable without wet hours or a snapshot', () => {
    const dry = JSON.stringify({ day: {}, hours: [hour(9, 10), hour(10, 5)] });
    expect(rainWindow(dry, LAB_TZ, LAB_DATE)).toEqual({ kind: 'dry' });
    expect(rainWindow(null, LAB_TZ, LAB_DATE)).toEqual({ kind: 'unavailable' });
  });
});
