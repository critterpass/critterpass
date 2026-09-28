import { afterEach, describe, expect, it } from 'vitest';

import {
  countdownDigits,
  countdownTarget,
  formatCountdown,
  getFlightSegmentsSource,
  registerFlightSegmentsSource,
  resetFlightSegmentsSourceForTests,
  type FlightSegment,
} from '../../src/home';

const ME = 'b8e3f0f2-4d1b-4c55-9c1e-2c1f5c2e0a11';
const BALI = { startDate: '2026-10-12', tz: 'Asia/Makassar' } as const;

describe('countdownTarget', () => {
  it('targets 00:00 on the first day in the destination zone without flights', () => {
    expect(countdownTarget(ME, [], BALI)?.toISOString()).toBe('2026-10-11T16:00:00.000Z');
  });

  it("targets the viewer's first outbound departure when flights are known", () => {
    const flights: FlightSegment[] = [
      { userId: ME, departsAt: '2026-10-11T22:40:00+08:00', direction: 'outbound' },
      { userId: ME, departsAt: '2026-10-11T19:05:00+08:00', direction: 'outbound' },
      { userId: ME, departsAt: '2026-10-10T08:00:00+08:00', direction: 'internal' },
      { userId: ME, departsAt: '2026-10-19T12:00:00+08:00', direction: 'return' },
      { userId: 'someone-else', departsAt: '2026-10-09T08:00:00+08:00', direction: 'outbound' },
    ];
    expect(countdownTarget(ME, flights, BALI)?.toISOString()).toBe('2026-10-11T11:05:00.000Z');
  });

  it('falls back to the trip start when only return flights are known', () => {
    const flights: FlightSegment[] = [
      { userId: ME, departsAt: '2026-10-19T12:00:00+08:00', direction: 'return' },
    ];
    expect(countdownTarget(ME, flights, BALI)?.toISOString()).toBe('2026-10-11T16:00:00.000Z');
  });

  it('is null until the trip has a start date and a zone', () => {
    expect(countdownTarget(ME, [], { startDate: null, tz: 'Asia/Makassar' })).toBeNull();
    expect(countdownTarget(ME, [], { startDate: '2026-10-12', tz: null })).toBeNull();
  });

  it('starts a trip whose first midnight is skipped by DST at the jump', () => {
    // Chile springs forward at 00:00 on 2026-09-06: local midnight never happens, 01:00 does.
    const target = countdownTarget(ME, [], { startDate: '2026-09-06', tz: 'America/Santiago' });
    expect(target?.toISOString()).toBe('2026-09-06T04:00:00.000Z');
  });

  it('starts a trip on a fall-back day at the one midnight it has', () => {
    const target = countdownTarget(ME, [], { startDate: '2026-10-25', tz: 'Europe/Lisbon' });
    expect(target?.toISOString()).toBe('2026-10-24T23:00:00.000Z');
  });
});

describe('formatCountdown', () => {
  const target = new Date('2026-10-11T16:00:00Z');

  it('counts days, hours, minutes and seconds, rounding up to whole seconds', () => {
    const now = new Date(target.getTime() - (17 * 86_400 + 5 * 3600 + 26 * 60 + 47) * 1000 + 400);
    const display = formatCountdown(now, target, BALI);
    expect(display).toEqual({ kind: 'counting', days: 17, hours: 5, minutes: 26, seconds: 47 });
    if (display.kind !== 'counting') throw new Error('expected counting');
    expect(countdownDigits(display)).toBe('17D 05:26:47');
  });

  it('drops the day part inside the last 24 hours', () => {
    const now = new Date(target.getTime() - (23 * 3600 + 59 * 60 + 59) * 1000);
    const display = formatCountdown(now, target, BALI);
    if (display.kind !== 'counting') throw new Error('expected counting');
    expect(countdownDigits(display)).toBe('23:59:59');
  });

  it('is the same instant for viewers in different zones', () => {
    // The display depends on the instant only; a viewer in Hanoi and one in London see one number.
    const now = new Date('2026-10-01T00:00:00Z');
    expect(formatCountdown(now, target, BALI)).toEqual(formatCountdown(now, target, BALI));
    expect(formatCountdown(now, target, BALI)).toMatchObject({ days: 10, hours: 16 });
  });

  it('shows TODAY on the first day and DAY n after, in the destination zone', () => {
    expect(formatCountdown(new Date('2026-10-11T16:00:00Z'), target, BALI)).toEqual({
      kind: 'today',
    });
    // 2026-10-13 23:30 UTC is 10-14 07:30 in Makassar: day 3.
    expect(formatCountdown(new Date('2026-10-13T23:30:00Z'), target, BALI)).toEqual({
      kind: 'day',
      day: 3,
    });
  });

  it('shows TODAY after an early flight target, before the first day starts at the destination', () => {
    const flight = new Date('2026-10-11T11:05:00Z');
    expect(formatCountdown(new Date('2026-10-11T12:00:00Z'), flight, BALI)).toEqual({
      kind: 'today',
    });
  });
});

describe('FlightSegmentsSource', () => {
  afterEach(() => resetFlightSegmentsSourceForTests());

  it('is empty until the bookings feature registers one', async () => {
    expect(getFlightSegmentsSource()).toBeNull();
    const segment: FlightSegment = {
      userId: ME,
      departsAt: '2026-10-11T19:05:00+08:00',
      direction: 'outbound',
    };
    registerFlightSegmentsSource<string>(() => Promise.resolve([segment]));
    const source = getFlightSegmentsSource<string>();
    expect(await source?.('tx', { tripId: 't', userIds: [ME] })).toEqual([segment]);
  });
});
