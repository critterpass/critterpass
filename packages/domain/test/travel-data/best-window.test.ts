import { describe, expect, it } from 'vitest';

import { bestWindow, openHours } from '../../src/travel-data/best-window';

/**
 * A hand-built weekday curve shaped like a hilltop shrine open around the clock: near-empty before
 * dawn, climbing from 08:00, busiest late morning to mid-afternoon (not supplier data).
 */
const SHRINE_DAY = [
  4, 3, 2, 2, 3, 6, 10, 18, 35, 60, 80, 92, 95, 97, 94, 88, 76, 60, 45, 32, 22, 14, 9, 6,
];

describe('bestWindow', () => {
  it('finds the early-morning window at a place open all day', () => {
    // Midnight to 04:00 is quieter still, so an all-hours place gets its quietest night run...
    expect(bestWindow(SHRINE_DAY, [{ start: '00:00', end: '24:00' }])).toEqual({
      start: '02:00',
      end: '04:00',
      level: 2,
    });
    // ...and a daytime visit (05:00 to 19:00) gets the first light before the climb.
    expect(bestWindow(SHRINE_DAY, [{ start: '05:00', end: '19:00' }])).toEqual({
      start: '05:00',
      end: '07:00',
      level: 8,
    });
  });

  it('keeps the window inside open hours, across split spans', () => {
    const spans = [
      { start: '09:00', end: '12:00' },
      { start: '15:00', end: '20:00' },
    ];
    expect(bestWindow(SHRINE_DAY, spans)).toEqual({ start: '18:00', end: '20:00', level: 39 });
  });

  it('wraps a span that runs past midnight', () => {
    expect(openHours([{ start: '22:00', end: '02:00' }]).flatMap((o, h) => (o ? [h] : []))).toEqual(
      [0, 1, 22, 23],
    );
  });

  it('falls back to the quietest single hour when the place opens for less than the window', () => {
    expect(bestWindow(SHRINE_DAY, [{ start: '13:00', end: '14:00' }])).toEqual({
      start: '13:00',
      end: '14:00',
      level: 97,
    });
  });

  it('prefers the earlier of two equally quiet windows', () => {
    const flat = Array.from({ length: 24 }, () => 10);
    expect(bestWindow(flat, [{ start: '08:00', end: '18:00' }])?.start).toBe('08:00');
  });

  it('returns null without a full curve or without open hours', () => {
    expect(bestWindow(SHRINE_DAY.slice(1), [{ start: '00:00', end: '24:00' }])).toBeNull();
    expect(bestWindow(SHRINE_DAY, [])).toBeNull();
  });
});
