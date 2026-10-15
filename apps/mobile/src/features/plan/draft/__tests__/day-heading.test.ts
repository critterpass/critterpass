import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import type { ReviewDay } from '../data/version';
import { dayHeading } from '../review/review-words';

function day(title: string, names: readonly string[]): ReviewDay {
  return {
    dayNo: 1,
    date: '2026-10-28',
    title,
    stops: names.map((name) => ({
      name,
      startsAt: '2026-10-28T02:30:00Z',
      tz: 'Asia/Ho_Chi_Minh',
      locked: false,
    })),
    owners: [],
    optional: false,
    closed: false,
    booked: false,
    lottery: null,
  };
}

describe('a draft day row heading', () => {
  beforeAll(() => i18n.loadAndActivate({ locale: 'en', messages: {} }));

  it('keeps the guide’s theme as the title and lists the stops under it', () => {
    const heading = dayHeading(
      'en',
      day('Bridges and hills', ['Japanese Covered Bridge', 'Bà Nà']),
    );
    expect(heading.title).toBe('Bridges and hills');
    expect(heading.detail).toBe('WED · Japanese Covered Bridge at 09:30, Bà Nà');
  });

  it('is headed by the first stop when the day has no theme, never blank or named twice', () => {
    const heading = dayHeading('en', day('  ', ['Japanese Covered Bridge', 'Bà Nà Hills']));
    expect(heading.title).toBe('Japanese Covered Bridge');
    expect(heading.detail).toBe('WED · 09:30, then Bà Nà Hills');
    expect(dayHeading('en', day('', ['Mỹ Sơn'])).detail).toBe('WED · 09:30');
  });

  it('names a day with no theme and no stops as a free day', () => {
    const heading = dayHeading('en', day('', []));
    expect(heading.title).toBe('Nothing. Bliss.');
    expect(heading.detail).toBe('WED · Nothing booked, on purpose');
  });
});
