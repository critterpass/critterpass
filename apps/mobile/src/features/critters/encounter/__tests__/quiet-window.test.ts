import { describe, expect, it } from '@jest/globals';

import { nextQuietWindow, zoneOffsetMin } from '../encounter-model';

const hourly = (quietHour: number) =>
  JSON.stringify(Array.from({ length: 24 }, (_, h) => (h === quietHour ? 5 : 60)));

describe('next quiet window', () => {
  const offset = zoneOffsetMin('Asia/Makassar', new Date('2026-10-03T00:00:00Z'));

  it('reads the zone offset', () => expect(offset).toBe(480));

  it('picks today’s quietest hour still ahead, between 06:00 and 18:00', () => {
    // Saturday 3 Oct, 08:00 in Bali; 15:00 is the quiet hour.
    const now = Date.parse('2026-10-03T00:00:00Z');
    const quiet = nextQuietWindow([{ dow: 6, hourly: hourly(15) }], now, offset);
    expect(quiet).toMatchObject({ today: true, litIndex: 9 });
    expect(new Date(quiet?.at ?? 0).toISOString()).toBe('2026-10-03T07:00:00.000Z');
  });

  it('moves to tomorrow once today’s quiet hour has passed', () => {
    const now = Date.parse('2026-10-03T09:00:00Z'); // 17:00 in Bali
    const quiet = nextQuietWindow(
      [
        { dow: 6, hourly: hourly(7) },
        { dow: 0, hourly: hourly(7) },
      ],
      now,
      offset,
    );
    expect(quiet?.today).toBe(false);
    expect(new Date(quiet?.at ?? 0).toISOString()).toBe('2026-10-03T23:00:00.000Z');
  });

  it('has nothing to offer without a forecast', () => {
    expect(nextQuietWindow([], Date.parse('2026-10-03T00:00:00Z'), offset)).toBeNull();
  });
});
