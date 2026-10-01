import { afterEach, describe, expect, it, vi } from 'vitest';

import { format } from '../src/format/index';

describe('format.number', () => {
  it('formats a plain number per locale grouping', () => {
    expect(format.number('en', 1234)).toBe('1,234');
    expect(format.number('de', 1234)).toBe('1.234');
  });
});

describe('format.compactNumber', () => {
  it('abbreviates large counts', () => {
    expect(format.compactNumber('en', 1200)).toBe('1.2K');
  });
});

describe('format.percent', () => {
  it('formats a fraction as a whole percent', () => {
    expect(format.percent('en', 0.42)).toBe('42%');
  });
});

describe('format.countdownUnit', () => {
  it('formats a narrow unit for countdown chips', () => {
    expect(format.countdownUnit('en', 17, 'day')).toBe('17d');
  });
});

describe('format.date / format.time', () => {
  const sample = new Date(Date.UTC(2026, 8, 27, 14, 5));

  it('formats a date per locale', () => {
    expect(
      format.date('en', sample, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
    ).toBe('Sep 27, 2026');
  });

  it('respects the 12/24-hour setting', () => {
    expect(format.time('en', sample, { hour12: false })).not.toMatch(/AM|PM/i);
    expect(format.time('en', sample, { hour12: true })).toMatch(/AM|PM/i);
  });
});

describe('format.dateInterval', () => {
  it('formats a range with one shared month', () => {
    const start = new Date(Date.UTC(2026, 8, 27));
    const end = new Date(Date.UTC(2026, 9, 3));
    const formatted = format.dateInterval('en', start, end, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    // Intl.DateTimeFormat.formatRange joins with U+2009 THIN SPACE + U+2013 EN DASH + U+2009, not a
    // plain hyphen; asserting per side avoids a raw non-ASCII whitespace literal in this file, which
    // `no-irregular-whitespace` flags.
    expect(formatted.startsWith('Sep 27')).toBe(true);
    expect(formatted.endsWith('Oct 3')).toBe(true);
    expect(formatted).toContain(String.fromCodePoint(0x2013));
  });
});

describe('format.relativeTime', () => {
  it('formats a future offset', () => {
    expect(format.relativeTime('en', 3, 'day')).toBe('in 3 days');
  });
});

describe('format.list', () => {
  it('joins names with a locale conjunction', () => {
    expect(format.list('en', ['Tokek', 'Pon', 'Lundi'])).toBe('Tokek, Pon, and Lundi');
  });
});

describe('format.distance', () => {
  it('formats metric distances in kilometres', () => {
    expect(format.distance('en', 4200, 'metric')).toBe('4.2 km');
  });

  it('formats imperial distances in miles', () => {
    expect(format.distance('en', 1609.344, 'imperial')).toBe('1 mi');
  });
});

describe('on a runtime without formatRange or compact notation (Hermes)', () => {
  const RealDateTimeFormat = Intl.DateTimeFormat;
  const RealNumberFormat = Intl.NumberFormat;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function hermes(): void {
    function DateTimeFormat(locale?: string | string[], options?: Intl.DateTimeFormatOptions) {
      const formatter = new RealDateTimeFormat(locale, options);
      return {
        format: (value?: Date | number) => formatter.format(value),
        formatToParts: (value?: Date | number) => formatter.formatToParts(value),
        resolvedOptions: () => formatter.resolvedOptions(),
      };
    }
    function NumberFormat(locale?: string | string[], options: Intl.NumberFormatOptions = {}) {
      const { notation: _notation, ...rest } = options;
      const formatter = new RealNumberFormat(locale, rest);
      return { format: (value: number) => formatter.format(value) };
    }
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
      DateTimeFormat as unknown as typeof Intl.DateTimeFormat,
    );
    vi.spyOn(Intl, 'NumberFormat').mockImplementation(
      NumberFormat as unknown as typeof Intl.NumberFormat,
    );
  }

  const day = (month: number, date: number) => new Date(Date.UTC(2026, month, date, 12));
  const options = { month: 'short', day: 'numeric', timeZone: 'UTC' } as const;

  it('writes a date interval instead of throwing', () => {
    hermes();
    expect(format.dateInterval('en', day(9, 2), day(9, 4), options)).toBe('Oct 2–4');
    expect(format.dateInterval('en', day(8, 27), day(9, 3), options)).toBe('Sep 27 – Oct 3');
    expect(format.dateInterval('en', day(9, 2), day(9, 2), options)).toBe('Oct 2');
  });

  it('scales a compact number itself', () => {
    hermes();
    expect(format.compactNumber('en', 1200)).toBe('1.2K');
    expect(format.compactNumber('en', 3_000_000)).toBe('3M');
    expect(format.compactNumber('en', 950)).toBe('950');
  });
});
