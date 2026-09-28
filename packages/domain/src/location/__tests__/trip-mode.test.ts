import { describe, expect, it } from 'vitest';

import { isTripMode, tripLocationMode, type TripModeInput, type TripModeTrip } from '../trip-mode';

const trip: TripModeTrip = {
  status: 'in_trip',
  startDate: '2026-10-10',
  endDate: '2026-10-14',
  tz: 'Asia/Makassar',
  destinationCountry: 'ID',
};

/** 2026-10-12 10:00 in Bali (UTC+8). */
const midTrip = new Date('2026-10-12T02:00:00Z');

function input(overrides: Partial<TripModeInput> = {}): TripModeInput {
  return {
    trip,
    now: midTrip,
    homeCountry: 'VN',
    currentCountry: 'ID',
    exploreAtHome: false,
    deviceTz: 'Asia/Ho_Chi_Minh',
    ...overrides,
  };
}

describe('tripLocationMode', () => {
  it('is off without a trip or for a trip outside its trip days', () => {
    expect(tripLocationMode(input({ trip: null }))).toEqual({ mode: 'off', reason: 'no_trip' });
    expect(tripLocationMode(input({ trip: { ...trip, status: 'confirmed' } })).reason).toBe(
      'no_trip',
    );
  });

  it('runs on a trip day inside the window', () => {
    expect(tripLocationMode(input())).toEqual({ mode: 'trip_day', reason: 'on' });
    expect(isTripMode(input())).toBe(true);
  });

  it('is off before the first and after the last trip date', () => {
    expect(tripLocationMode(input({ now: new Date('2026-10-09T02:00:00Z') })).reason).toBe(
      'not_trip_day',
    );
    expect(tripLocationMode(input({ now: new Date('2026-10-15T02:00:00Z') })).reason).toBe(
      'not_trip_day',
    );
  });

  it('trusts the status when the trip has no dates', () => {
    const undated = { ...trip, startDate: null, endDate: null };
    expect(tripLocationMode(input({ trip: undated })).mode).toBe('trip_day');
  });

  it('reads the window in the trip zone, falling back to the device zone', () => {
    // 04:30 in Bali: before the 05:00 window.
    const early = new Date('2026-10-11T20:30:00Z');
    expect(tripLocationMode(input({ now: early })).reason).toBe('outside_window');
    // 03:30 in Ho Chi Minh City when the trip has no zone yet.
    const noTz = { ...trip, tz: null };
    expect(tripLocationMode(input({ trip: noTz, now: early })).reason).toBe('outside_window');
    expect(
      tripLocationMode(input({ now: early, window: { startMinute: 4 * 60, endMinute: 1440 } }))
        .mode,
    ).toBe('trip_day');
    // A window that closes at 22:00 excludes 23:00.
    const late = new Date('2026-10-12T15:00:00Z');
    expect(
      tripLocationMode(input({ now: late, window: { startMinute: 300, endMinute: 22 * 60 } }))
        .reason,
    ).toBe('outside_window');
  });

  it('is off at home unless the explore-at-home opt-in is on, which is foreground-only', () => {
    expect(tripLocationMode(input({ currentCountry: 'VN' }))).toEqual({
      mode: 'off',
      reason: 'at_home',
    });
    expect(tripLocationMode(input({ currentCountry: 'vn', exploreAtHome: true }))).toEqual({
      mode: 'explore_at_home',
      reason: 'at_home',
    });
  });

  it('treats a domestic trip as away even in the home country', () => {
    const domestic = { ...trip, destinationCountry: 'VN' };
    expect(tripLocationMode(input({ trip: domestic, currentCountry: 'VN' })).mode).toBe('trip_day');
  });

  it('runs when home or the current country is unknown', () => {
    expect(tripLocationMode(input({ homeCountry: null, currentCountry: 'VN' })).mode).toBe(
      'trip_day',
    );
    expect(tripLocationMode(input({ currentCountry: null })).mode).toBe('trip_day');
    const noDest = { ...trip, destinationCountry: null };
    expect(tripLocationMode(input({ trip: noDest, currentCountry: 'VN' })).reason).toBe('at_home');
  });

  it('runs a pre-trip travel day for leave-by, at home included', () => {
    const pre = { ...trip, status: 'pre_trip' as const };
    const departure = new Date('2026-10-10T01:00:00Z');
    expect(tripLocationMode(input({ trip: pre, now: departure, currentCountry: 'VN' }))).toEqual({
      mode: 'travel_day',
      reason: 'on',
    });
    expect(
      tripLocationMode(input({ trip: pre, now: new Date('2026-10-09T01:00:00Z') })).reason,
    ).toBe('not_trip_day');
    expect(tripLocationMode(input({ trip: { ...pre, startDate: null } })).reason).toBe(
      'not_trip_day',
    );
    expect(
      tripLocationMode(input({ trip: pre, now: new Date('2026-10-09T20:00:00Z') })).reason,
    ).toBe('outside_window');
    // 22:30 on departure day with a window closing at 22:00.
    const lateDeparture = new Date('2026-10-10T14:30:00Z');
    const shortWindow = { startMinute: 300, endMinute: 22 * 60 };
    expect(
      tripLocationMode(input({ trip: pre, now: lateDeparture, window: shortWindow })).reason,
    ).toBe('outside_window');
    expect(isTripMode(input({ trip: pre, now: new Date('2026-10-09T01:00:00Z') }))).toBe(false);
  });
});
