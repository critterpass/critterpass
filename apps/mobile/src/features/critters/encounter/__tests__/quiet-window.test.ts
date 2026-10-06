import { describe, expect, it } from '@jest/globals';

import { nextQuietWindow, zoneOffsetMin } from '../encounter-model';

const hourly = (quietHour: number) =>
  Array.from({ length: 24 }, (_, h) => (h === quietHour ? 5 : 60));
const source = 'besttime';

describe('next quiet window', () => {
  const offset = zoneOffsetMin('Asia/Makassar', new Date('2026-10-03T00:00:00Z'));

  it('reads the zone offset', () => expect(offset).toBe(480));

  it('picks today’s quietest hour still ahead, between 06:00 and 18:00', () => {
    // Saturday 3 Oct, 08:00 in Bali; 15:00 is the quiet hour.
    const now = Date.parse('2026-10-03T00:00:00Z');
    const quiet = nextQuietWindow([{ dow: 6, hourly: hourly(15), source }], now, offset);
    expect(quiet).toMatchObject({ today: true, litIndex: 9 });
    expect(new Date(quiet?.at ?? 0).toISOString()).toBe('2026-10-03T07:00:00.000Z');
  });

  it('moves to tomorrow once today’s quiet hour has passed', () => {
    const now = Date.parse('2026-10-03T09:00:00Z'); // 17:00 in Bali
    const quiet = nextQuietWindow(
      [
        { dow: 6, hourly: hourly(7), source },
        { dow: 0, hourly: hourly(7), source },
      ],
      now,
      offset,
    );
    expect(quiet?.today).toBe(false);
    expect(new Date(quiet?.at ?? 0).toISOString()).toBe('2026-10-03T23:00:00.000Z');
  });

  it('shows what crews saw over the editorial week, and never an unapproved one', () => {
    const now = Date.parse('2026-10-03T00:00:00Z');
    const rows = [
      { dow: 6, hourly: hourly(15), source: 'editorial', approved_at: '2026-10-01T00:00:00Z' },
      { dow: 6, hourly: hourly(9), source: 'visits' },
    ];
    expect(nextQuietWindow(rows, now, offset)?.litIndex).toBe(3);
    const unapproved = [{ dow: 6, hourly: hourly(15), source: 'editorial', approved_at: null }];
    expect(nextQuietWindow(unapproved, now, offset)).toBeNull();
  });

  it('has nothing to offer without a forecast', () => {
    expect(nextQuietWindow([], Date.parse('2026-10-03T00:00:00Z'), offset)).toBeNull();
  });
});
