import type { WeatherHour } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { suggestWeatherMove, type ReplanInput } from '../index';

const BALI = 'Asia/Makassar';
/** Local Bali hour on 16 October as an instant. */
const at = (hhmm: string) => new Date(`2026-10-16T${hhmm}:00+08:00`);
function day(wet: (hour: number) => number): WeatherHour[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    at: at(`${String(hour).padStart(2, '0')}:00`).toISOString(),
    temp_c: 28,
    chance_of_rain: wet(hour),
    precip_mm: 0,
    wind_kph: 8,
    gust_kph: 12,
    uv: 6,
    code: 1000,
    is_day: hour >= 6 && hour < 19,
  }));
}
const rainNoonToThree = day((hour) => (hour >= 12 && hour < 15 ? 80 : 10));
const walk = (fields: Partial<ReplanInput['item']> = {}): ReplanInput['item'] => ({
  stableId: '0190f0a0-0000-7000-a000-000000000001',
  title: 'Campuhan ridge walk',
  startsAt: at('13:00'),
  endsAt: at('14:30'),
  locked: false,
  ...fields,
});

describe('suggestWeatherMove', () => {
  it('moves a rained-on walk to the nearest dry slot, after the rain when it is as near', () => {
    const suggestion = suggestWeatherMove({
      item: walk(),
      others: [{ startsAt: at('10:00'), endsAt: at('11:30') }],
      weather: rainNoonToThree,
      tz: BALI,
    });
    expect(suggestion?.facts).toEqual({
      title: 'Campuhan ridge walk',
      from: '13:00',
      to: '15:00',
      rain_from: '12:00',
      rain_until: '15:00',
      rain_pct: 80,
    });
  });

  it('keeps clear of the other items and their buffers, earlier when that is nearer', () => {
    const suggestion = suggestWeatherMove({
      item: walk(),
      others: [{ startsAt: at('15:00'), endsAt: at('16:00') }],
      weather: rainNoonToThree,
      tz: BALI,
    });
    expect(suggestion?.facts['to']).toBe('10:30');
  });

  it('suggests nothing for a dry item, a locked item, or a day with no dry slot', () => {
    const dry = day(() => 5);
    expect(suggestWeatherMove({ item: walk(), others: [], weather: dry, tz: BALI })).toBeNull();
    expect(
      suggestWeatherMove({
        item: walk({ locked: true }),
        others: [],
        weather: rainNoonToThree,
        tz: BALI,
      }),
    ).toBeNull();
    const wet = day(() => 90);
    expect(suggestWeatherMove({ item: walk(), others: [], weather: wet, tz: BALI })).toBeNull();
  });
});
