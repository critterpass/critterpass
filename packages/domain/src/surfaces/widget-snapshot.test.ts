import { describe, expect, it } from 'vitest';

import type { WeatherHour } from '../travel-data/types';
import { widgetRefreshPriority } from './widget-refresh';
import {
  buildWidgetSnapshot,
  etaBucket,
  widgetSnapshotContent,
  widgetSnapshotSchema,
  type WidgetSnapshotInput,
} from './widget-snapshot';
import { widgetFirstName, widgetForecast, widgetInitial } from './widget-snapshot-fields';

const FLIGHT = {
  id: '0192a000-0000-7000-8000-000000000001',
  carrier: 'VJ',
  flight_no: 'VJ631',
  dep_airport: 'SGN',
  arr_airport: 'DAD',
  departs_at: '2026-10-03T01:00:00.000Z',
  boarding_at: null,
  gate: null,
  terminal: null,
  status: 'scheduled',
  delay_min: null,
};

const CREW = {
  meetup: null,
  members: [
    { user_id: '0192a000-0000-7000-8000-000000000002', bucket: 'close' as const, initial: 'J' },
  ],
};

function input(overrides: Partial<WidgetSnapshotInput> = {}): WidgetSnapshotInput {
  return {
    now: new Date('2026-10-02T00:00:00Z'),
    trip: null,
    countdownTargetAt: new Date('2026-10-03T01:00:00Z'),
    vote: null,
    today: null,
    balances: { currency: 'VND', net_minor: -125_000, nudge: null },
    crew: CREW,
    critterdex: { found: 3, total: 61 },
    nextFlight: FLIGHT,
    nextLeaveBy: null,
    passPlus: false,
    boostActive: false,
    ...overrides,
  };
}

describe('widget snapshot', () => {
  it('omits the next flight and the crew and marks them locked without the perks', () => {
    const snapshot = buildWidgetSnapshot(input());
    expect(snapshot.next_flight).toBeNull();
    expect(snapshot.crew).toBeNull();
    expect(snapshot.locked).toEqual(['crew', 'next_flight']);
    expect(snapshot.countdown).toEqual({ target_at: '2026-10-03T01:00:00.000Z' });
  });

  it('carries the next flight with Pass+ and the crew with a boost', () => {
    const snapshot = buildWidgetSnapshot(input({ passPlus: true, boostActive: true }));
    expect(snapshot.next_flight).toEqual(FLIGHT);
    expect(snapshot.crew).toEqual(CREW);
    expect(snapshot.locked).toEqual([]);
  });

  it('keeps the same content across clocks, so the ETag only moves with the data', () => {
    const a = buildWidgetSnapshot(input());
    const b = buildWidgetSnapshot(input({ now: new Date('2026-10-02T05:00:00Z') }));
    expect(widgetSnapshotContent(a)).toEqual(widgetSnapshotContent(b));
  });
});

describe('widget snapshot from an older server', () => {
  it('reads a snapshot without the newer fields, with empty defaults', () => {
    const older = {
      ...buildWidgetSnapshot(input({ boostActive: true })),
      today: { local_date: '2026-10-02', items: [] },
      balances: { currency: 'VND', net_minor: -125_000 },
      crew: { meetup: null, members: [{ user_id: CREW.members[0]!.user_id, bucket: 'close' }] },
    };
    const parsed = widgetSnapshotSchema.parse(older);
    expect(parsed.today).toEqual({
      local_date: '2026-10-02',
      items: [],
      plan: [],
      packing: [],
      forecast: null,
    });
    expect(parsed.balances?.nudge).toBeNull();
    expect(parsed.crew?.members[0]?.initial).toBe('?');
  });
});

const hour = (at: string, overrides: Partial<WeatherHour> = {}): WeatherHour => ({
  at,
  temp_c: 29,
  chance_of_rain: 10,
  precip_mm: 0,
  wind_kph: 8,
  gust_kph: 12,
  uv: 6,
  code: 1000,
  is_day: true,
  ...overrides,
});

describe('widget forecast', () => {
  const now = new Date('2026-10-15T03:30:00Z');

  it('reads the rest of the day: the high, and the first hour rain is likely', () => {
    const forecast = widgetForecast(
      [
        hour('2026-10-15T01:00:00Z', { temp_c: 35, chance_of_rain: 90 }),
        hour('2026-10-15T03:00:00Z', { temp_c: 30.6 }),
        hour('2026-10-15T06:00:00Z', { temp_c: 28, chance_of_rain: 70, code: 1189 }),
        hour('2026-10-15T08:00:00Z', { temp_c: 26, code: 1183 }),
      ],
      now,
    );
    // The 01:00 hour is past: neither its heat nor its rain counts.
    expect(forecast).toEqual({
      temp_max_c: 31,
      condition: 'rain',
      rain_from: '2026-10-15T06:00:00.000Z',
    });
  });

  it('says clear, cloudy or storm without rain, and nothing without hours ahead', () => {
    expect(widgetForecast([hour('2026-10-15T05:00:00Z')], now)?.condition).toBe('clear');
    expect(widgetForecast([hour('2026-10-15T05:00:00Z', { code: 1009 })], now)?.condition).toBe(
      'cloudy',
    );
    expect(widgetForecast([hour('2026-10-15T05:00:00Z', { code: 1087 })], now)?.condition).toBe(
      'storm',
    );
    expect(widgetForecast([hour('2026-10-15T01:00:00Z')], now)).toBeNull();
  });
});

describe('names on widgets', () => {
  it('keeps a first name and an initial, never the rest', () => {
    expect(widgetFirstName('Dev Rao')).toBe('Dev');
    expect(widgetFirstName('  ')).toBeNull();
    expect(widgetFirstName(null)).toBeNull();
    expect(widgetInitial('đức anh')).toBe('Đ');
    expect(widgetInitial(null)).toBe('?');
  });
});

describe('crew ETA buckets', () => {
  it('buckets arrivals, short and long ETAs and unknowns', () => {
    expect(etaBucket(null, 1)).toBe('here');
    expect(etaBucket(1, null)).toBe('here');
    expect(etaBucket(12, 0.4)).toBe('close');
    expect(etaBucket(40, 0.1)).toBe('on_way');
    expect(etaBucket(null, null)).toBe('unknown');
  });
});

describe('widget refresh priority', () => {
  it('pushes vote closes and tally moves at once, batches the rest and ignores chat', () => {
    expect(widgetRefreshPriority('poll.closed')).toBe('priority');
    expect(widgetRefreshPriority('ballot.cast')).toBe('priority');
    expect(widgetRefreshPriority('expense.added')).toBe('routine');
    expect(widgetRefreshPriority('booking.flight_changed')).toBe('routine');
    expect(widgetRefreshPriority('chat.message_sent')).toBeNull();
  });
});
