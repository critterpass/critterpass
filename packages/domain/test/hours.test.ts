import { describe, expect, it } from 'vitest';

import { DomainError } from '../src/errors';
import { parseOpeningHours, type Hours } from '../src/places/hours';
import { closesSoon, nextOpen, openAt } from '../src/places/open-at';

function hoursFrom(source: string): Hours {
  return { weekly: parseOpeningHours(source) };
}

describe('parseOpeningHours', () => {
  it('expands a day range with a single time span', () => {
    expect(parseOpeningHours('Mo-Fr 09:00-18:00')).toEqual({
      mo: [{ start: '09:00', end: '18:00' }],
      tu: [{ start: '09:00', end: '18:00' }],
      we: [{ start: '09:00', end: '18:00' }],
      th: [{ start: '09:00', end: '18:00' }],
      fr: [{ start: '09:00', end: '18:00' }],
    });
  });

  it('expands a comma-separated day list with comma-separated time spans', () => {
    expect(parseOpeningHours('Mo,We,Fr 09:00-12:00,13:00-18:00')).toEqual({
      mo: [
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '18:00' },
      ],
      we: [
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '18:00' },
      ],
      fr: [
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '18:00' },
      ],
    });
  });

  it('marks a day off/closed with no spans', () => {
    expect(parseOpeningHours('Mo-Su 09:00-18:00; We off')).toEqual({
      mo: [{ start: '09:00', end: '18:00' }],
      tu: [{ start: '09:00', end: '18:00' }],
      we: [],
      th: [{ start: '09:00', end: '18:00' }],
      fr: [{ start: '09:00', end: '18:00' }],
      sa: [{ start: '09:00', end: '18:00' }],
      su: [{ start: '09:00', end: '18:00' }],
    });
  });

  it('treats 24/7 as every day open from midnight to midnight', () => {
    const parsed = parseOpeningHours('24/7');
    for (const day of ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const) {
      expect(parsed[day]).toEqual([{ start: '00:00', end: '24:00' }]);
    }
  });

  it('keeps an overnight span as-is (end < start), for open-at.ts to interpret', () => {
    expect(parseOpeningHours('Fr-Sa 20:00-02:00')).toEqual({
      fr: [{ start: '20:00', end: '02:00' }],
      sa: [{ start: '20:00', end: '02:00' }],
    });
  });

  it('leaves a day unmentioned by any rule with no spans (closed)', () => {
    const parsed = parseOpeningHours('Mo-Fr 09:00-18:00');
    expect(parsed.sa).toBeUndefined();
    expect(parsed.su).toBeUndefined();
  });

  it('rejects an unrecognised day token', () => {
    expect(() => parseOpeningHours('Xx 09:00-18:00')).toThrow(DomainError);
  });

  it('rejects an unrecognised time span', () => {
    expect(() => parseOpeningHours('Mo 9am-6pm')).toThrow(DomainError);
  });

  it('returns no spans at all for an empty string', () => {
    expect(parseOpeningHours('  ')).toEqual({});
  });
});

describe('openAt: Fushimi Inari Shrine (Kyoto, 24/7, Asia/Tokyo)', () => {
  const hours = hoursFrom('24/7');

  it('is open at 3am on a Tuesday', () => {
    // 2026-09-29 is a Tuesday; 03:00 JST (UTC+9) = 2026-09-28T18:00:00Z.
    expect(openAt(hours, 'Asia/Tokyo', new Date('2026-09-28T18:00:00Z'))).toBe(true);
  });

  it('is open at noon on a Sunday', () => {
    expect(openAt(hours, 'Asia/Tokyo', new Date('2026-10-04T03:00:00Z'))).toBe(true);
  });
});

describe('openAt: Nishiki Market (Kyoto, daily daytime hours, Asia/Tokyo)', () => {
  const hours = hoursFrom('Mo-Su 09:00-18:00');

  it('is open mid-afternoon', () => {
    // 2026-09-30T05:00:00Z = 14:00 JST.
    expect(openAt(hours, 'Asia/Tokyo', new Date('2026-09-30T05:00:00Z'))).toBe(true);
  });

  it('is closed before opening', () => {
    // 2026-09-30T23:00:00Z = 08:00 JST the next day.
    expect(openAt(hours, 'Asia/Tokyo', new Date('2026-09-30T23:00:00Z'))).toBe(false);
  });

  it('is closed after closing, and reports closing time was not "soon" hours earlier', () => {
    // 2026-09-30T10:00:00Z = 19:00 JST: one hour past the 18:00 close.
    const afterClose = new Date('2026-09-30T10:00:00Z');
    expect(openAt(hours, 'Asia/Tokyo', afterClose)).toBe(false);
    expect(closesSoon(hours, 'Asia/Tokyo', afterClose, 30)).toBe(false);
  });

  it('reports closing soon within the requested window but not a tighter one', () => {
    // 2026-09-30T08:45:00Z = 17:45 JST: 15 minutes before the 18:00 close.
    const almostClosing = new Date('2026-09-30T08:45:00Z');
    expect(closesSoon(hours, 'Asia/Tokyo', almostClosing, 30)).toBe(true);
    expect(closesSoon(hours, 'Asia/Tokyo', almostClosing, 10)).toBe(false);
  });
});

describe('openAt: overnight bar (Fr-Sa 20:00-02:00, Asia/Tokyo)', () => {
  const hours = hoursFrom('Fr-Sa 20:00-02:00');

  it('is open just after opening on Friday night', () => {
    // 2026-10-02 is a Friday; 21:00 JST = 2026-10-02T12:00:00Z.
    expect(openAt(hours, 'Asia/Tokyo', new Date('2026-10-02T12:00:00Z'))).toBe(true);
  });

  it('carries over into the small hours of Saturday from Friday night', () => {
    // 01:00 JST Saturday = 2026-10-02T16:00:00Z.
    expect(openAt(hours, 'Asia/Tokyo', new Date('2026-10-02T16:00:00Z'))).toBe(true);
  });

  it('carries over into the small hours of Sunday from Saturday night', () => {
    // 01:00 JST Sunday = 2026-10-03T16:00:00Z.
    expect(openAt(hours, 'Asia/Tokyo', new Date('2026-10-03T16:00:00Z'))).toBe(true);
  });

  it('is closed on Saturday afternoon, between the two overnight windows', () => {
    // 15:00 JST Saturday = 2026-10-03T06:00:00Z.
    expect(openAt(hours, 'Asia/Tokyo', new Date('2026-10-03T06:00:00Z'))).toBe(false);
  });

  it('does not carry over into Monday: Sunday has no span to carry', () => {
    // 01:00 JST Monday = 2026-10-04T16:00:00Z.
    expect(openAt(hours, 'Asia/Tokyo', new Date('2026-10-04T16:00:00Z'))).toBe(false);
  });
});

describe('openAt: DST boundary correctness (Lisbon, Europe/Lisbon)', () => {
  // A narrow one-hour window makes an off-by-one-hour offset bug flip the result, unlike a wide
  // window that would happen to still read "open" either way.
  const hours = hoursFrom('Mo-Su 09:00-10:00');

  it('reads the post-spring-forward offset (WEST, UTC+1), not the stale WET offset', () => {
    // Lisbon springs forward at 2026-03-29T01:00:00Z (verified: offset 0 -> +60min). At
    // 2026-03-29T08:30:00Z the correct local time is 09:30 (open); the stale pre-transition
    // offset would wrongly compute 08:30 (closed).
    expect(openAt(hours, 'Europe/Lisbon', new Date('2026-03-29T08:30:00Z'))).toBe(true);
  });

  it('reads the post-fall-back offset (WET, UTC+0), not the stale WEST offset', () => {
    // Lisbon falls back at 2026-10-25T01:00:00Z (verified: offset +60 -> 0min). At
    // 2026-10-25T08:30:00Z the correct local time is 08:30 (closed); the stale pre-transition
    // offset would wrongly compute 09:30 (open).
    expect(openAt(hours, 'Europe/Lisbon', new Date('2026-10-25T08:30:00Z'))).toBe(false);
  });
});

describe('openAt: Reykjavik has no DST (Atlantic/Reykjavik, fixed UTC+0 year-round)', () => {
  const hours = hoursFrom('Mo-Su 09:00-17:00');

  it('evaluates the same offset in both January and July', () => {
    expect(openAt(hours, 'Atlantic/Reykjavik', new Date('2026-01-15T10:00:00Z'))).toBe(true);
    expect(openAt(hours, 'Atlantic/Reykjavik', new Date('2026-07-15T10:00:00Z'))).toBe(true);
    expect(openAt(hours, 'Atlantic/Reykjavik', new Date('2026-07-15T20:00:00Z'))).toBe(false);
  });
});

describe('nextOpen', () => {
  it('returns the same instant when already open', () => {
    const hours = hoursFrom('Mo-Fr 09:00-18:00');
    const instant = new Date('2026-09-30T05:00:00Z'); // Wednesday 14:00 JST
    expect(nextOpen(hours, 'Asia/Tokyo', instant)).toEqual(instant);
  });

  it('finds later today when closed but opening again the same day', () => {
    const hours = hoursFrom('Mo-Su 09:00-12:00,13:00-18:00');
    // 2026-09-30T03:30:00Z = 12:30 JST: between the lunch break's two spans.
    const result = nextOpen(hours, 'Asia/Tokyo', new Date('2026-09-30T03:30:00Z'));
    expect(result).toEqual(new Date('2026-09-30T04:00:00Z')); // 13:00 JST
  });

  it('skips over a closed weekend to the following Monday', () => {
    const hours = hoursFrom('Mo-Fr 09:00-18:00');
    // 2026-10-03 is a Saturday, 10:00 JST = 2026-10-03T01:00:00Z.
    const result = nextOpen(hours, 'Asia/Tokyo', new Date('2026-10-03T01:00:00Z'));
    // Next Monday (2026-10-05) 09:00 JST = 2026-10-05T00:00:00Z.
    expect(result).toEqual(new Date('2026-10-05T00:00:00Z'));
  });

  it('returns null when the place never opens (every day off)', () => {
    const hours: Hours = { weekly: {} };
    expect(nextOpen(hours, 'Asia/Tokyo', new Date('2026-09-30T00:00:00Z'))).toBeNull();
  });

  it('honours a dated exception over the weekly pattern', () => {
    const hours: Hours = {
      weekly: parseOpeningHours('Mo-Su 09:00-18:00'),
      exceptions: [{ date: '2026-09-30', spans: [] }],
    };
    // 2026-09-30T05:00:00Z would be open (14:00 JST) under the weekly pattern, but the exception
    // closes the whole day.
    expect(openAt(hours, 'Asia/Tokyo', new Date('2026-09-30T05:00:00Z'))).toBe(false);
  });
});
