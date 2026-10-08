import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearFormatterCache,
  dateTimeFormat,
  listFormat,
  numberFormat,
  relativeTimeFormat,
} from '../src/format/formatter-cache';
import { format } from '../src/format/index';

afterEach(() => {
  vi.restoreAllMocks();
  clearFormatterCache();
});

describe('formatter cache', () => {
  it('reuses one formatter for the same locale and options, in any key order', () => {
    const first = dateTimeFormat('en', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    expect(dateTimeFormat('en', { timeZone: 'UTC', minute: '2-digit', hour: '2-digit' })).toBe(
      first,
    );
    expect(numberFormat('vi', { style: 'currency', currency: 'VND' })).toBe(
      numberFormat('vi', { style: 'currency', currency: 'VND' }),
    );
    expect(numberFormat('en')).toBe(numberFormat('en'));
    expect(relativeTimeFormat('en', { numeric: 'auto' })).toBe(
      relativeTimeFormat('en', { numeric: 'auto' }),
    );
    expect(listFormat('en', { type: 'conjunction' })).toBe(
      listFormat('en', { type: 'conjunction' }),
    );
  });

  it('treats an option left undefined like one left out', () => {
    expect(dateTimeFormat('en', { hour: 'numeric', hour12: undefined })).toBe(
      dateTimeFormat('en', { hour: 'numeric' }),
    );
  });

  it('builds a different formatter for another locale or another option', () => {
    const base = dateTimeFormat('en', { hour: 'numeric', minute: '2-digit', hour12: true });
    expect(dateTimeFormat('vi', { hour: 'numeric', minute: '2-digit', hour12: true })).not.toBe(
      base,
    );
    expect(dateTimeFormat('en', { hour: 'numeric', minute: '2-digit', hour12: false })).not.toBe(
      base,
    );
    expect(dateTimeFormat('en', { hour: 'numeric', minute: '2-digit' })).not.toBe(base);
    expect(numberFormat('en', { style: 'currency', currency: 'USD' })).not.toBe(
      numberFormat('en', { style: 'currency', currency: 'VND' }),
    );
  });

  it('builds a device-zone formatter again once the device changes zone', () => {
    const local = dateTimeFormat('en', { hour: 'numeric' });
    const pinned = dateTimeFormat('en', { hour: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
    const offset = new Date().getTimezoneOffset();
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(offset - 60);
    expect(dateTimeFormat('en', { hour: 'numeric' })).not.toBe(local);
    expect(dateTimeFormat('en', { hour: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })).toBe(pinned);
  });

  it('constructs once however often a helper is called', () => {
    const built = vi.spyOn(Intl, 'DateTimeFormat');
    const at = new Date(Date.UTC(2026, 9, 8, 14, 5));
    for (let i = 0; i < 20; i += 1) format.time('en', at, { hour12: false });
    expect(built).toHaveBeenCalledTimes(1);
  });
});

describe('cached helpers write what Intl writes', () => {
  const at = new Date(Date.UTC(2026, 9, 8, 14, 5));
  const space = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

  it('a date', () => {
    const options = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' } as const;
    expect(format.date('en', at, options)).toBe('Oct 8, 2026');
    expect(format.date('vi', at, options)).toBe(new Intl.DateTimeFormat('vi', options).format(at));
  });

  it('a time on the 12-hour and the 24-hour clock', () => {
    const utc = { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' } as const;
    expect(space(format.date('en', at, { ...utc, hour12: true }))).toBe('2:05 PM');
    expect(format.date('en', at, { ...utc, hour12: false })).toBe('14:05');
    // Asked for one after the other, the two clocks never share a formatter.
    expect(space(format.date('en', at, { ...utc, hour12: true }))).toBe('2:05 PM');
  });

  it('đồng and dollars', () => {
    const dong = { style: 'currency', currency: 'VND' } as const;
    const dollars = { style: 'currency', currency: 'USD' } as const;
    expect(space(format.number('vi', 125_000, dong))).toBe('125.000 ₫');
    expect(format.number('en', 12.5, dollars)).toBe('$12.50');
    expect(format.number('vi', 12.5, dollars)).toBe(
      new Intl.NumberFormat('vi', dollars).format(12.5),
    );
  });
});
