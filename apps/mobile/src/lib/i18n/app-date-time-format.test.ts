/**
 * Every date formatter in the app writes English days before months and takes the app's clock when
 * it doesn't choose one, also one built straight on `Intl.DateTimeFormat`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';

import { appDateLocales, installAppDateTimeFormat, withAppClock } from './app-date-time-format';
import { DEFAULT_FORMATS, setFormats } from './formats';

const AT = new Date('2026-10-15T15:08:00Z');
const plain = (text: string) => text.replace(/[\u202f\u00a0]/gu, ' ');
const engine = Intl.DateTimeFormat;

beforeAll(() => installAppDateTimeFormat());
afterAll(() => {
  Intl.DateTimeFormat = engine;
});
afterEach(() => setFormats(DEFAULT_FORMATS));

describe('app dates and clocks', () => {
  it('writes English dates day first', () => {
    const day = new Intl.DateTimeFormat('en', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    expect(day.format(AT)).toBe('Thu 15 Oct');
    expect(
      new Intl.DateTimeFormat('vi', { day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(
        AT,
      ),
    ).toBe('15/10');
    expect(appDateLocales(['en', 'vi'])).toEqual(['en-GB', 'vi']);
  });

  it('writes a span inside one month as its days, on every engine', () => {
    const days = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const nov = (day: number) => new Date(Date.UTC(2026, 10, day, 12));
    expect(plain(days.formatRange(nov(5), nov(11)))).toBe('5–11 Nov');
    expect(plain(days.formatRange(nov(5), nov(5)))).toBe('5 Nov');
    expect(plain(days.formatRange(new Date(Date.UTC(2026, 9, 29, 12)), nov(2)))).toBe(
      '29 Oct – 2 Nov',
    );
    const vi = new Intl.DateTimeFormat('vi', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    expect(plain(vi.formatRange(nov(5), nov(11)))).toBe(
      plain(vi.format(nov(5))).replace('5', '5–11'),
    );
  });

  it('gives a time with no clock of its own the app clock', () => {
    const time = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    });
    expect(time.format(AT)).toBe('15:08');
    setFormats({ time: '12h', distance: 'km' });
    const twelve = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    });
    expect(plain(twelve.format(AT))).toBe('3:08 PM');
  });

  it("keeps a formatter's own choice and leaves dates alone", () => {
    expect(withAppClock({ hour: 'numeric', hour12: true })).toEqual({
      hour: 'numeric',
      hour12: true,
    });
    expect(withAppClock({ day: 'numeric' })).toEqual({ day: 'numeric' });
    expect(new Intl.DateTimeFormat('en') instanceof engine).toBe(true);
  });
});
