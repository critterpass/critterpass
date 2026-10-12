/**
 * Crew settings says when each trip runs and how long the crew code still works, in words.
 */
import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { codeDaysLeft, tripDatesLine } from '../crew-copy';

const NOW = new Date(2026, 9, 15, 9, 30);

describe('crew trip dates and code expiry', () => {
  beforeAll(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));

  const trip = (status: string, start: string | null, end: string | null) => ({
    status,
    start_date: start,
    end_date: end,
  });

  it('writes a range inside one month once, and across months in full', () => {
    expect(tripDatesLine(trip('planning', '2026-11-12', '2026-11-19'), NOW, 'en')).toBe(
      'Nov 12–19',
    );
    expect(tripDatesLine(trip('planning', '2026-10-30', '2026-11-02'), NOW, 'en')).toBe(
      'Oct 30 – Nov 2',
    );
    expect(tripDatesLine(trip('planning', '2026-11-12', null), NOW, 'en')).toBe('Nov 12');
    expect(tripDatesLine(trip('planning', null, null), NOW, 'en')).toBeNull();
  });

  it('adds the day the crew is on while the trip runs, kept inside the trip', () => {
    expect(tripDatesLine(trip('in_trip', '2026-10-12', '2026-10-19'), NOW, 'en')).toBe(
      'Oct 12–19 · day 4 of 8',
    );
    expect(tripDatesLine(trip('in_trip', '2026-10-01', '2026-10-05'), NOW, 'en')).toBe(
      'Oct 1–5 · day 5 of 5',
    );
  });

  it('counts the code’s days left up to its expiry, never below zero', () => {
    expect(codeDaysLeft(new Date(2026, 9, 22, 9, 30).toISOString(), NOW)).toBe('7 days left');
    expect(codeDaysLeft(new Date(2026, 9, 15, 20, 0).toISOString(), NOW)).toBe('1 day left');
    expect(codeDaysLeft(new Date(2026, 9, 10).toISOString(), NOW)).toBe('0 days left');
    expect(codeDaysLeft(null, NOW)).toBeNull();
  });
});
