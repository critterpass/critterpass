/**
 * The roundup poster's rows fit the push's 1 KB block: at most five, and when they run long the
 * links go first, then the lines under titles, then rows from the end.
 */
import { jsonBytes } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { roundupLines } from '../src/jobs/roundup/lines';

const source = (n: number, body = 'Two rooms at the villa, both refundable') => ({
  key: 'booking_found',
  title: `Booking ${n} found in your email`,
  body,
  deepLink: `critterpass://trips/00000000-0000-7000-8000-00000000000${n}/wallet`,
});

describe('roundup poster rows', () => {
  it('keeps every part of five short rows', () => {
    const lines = roundupLines(
      [1, 2, 3, 4, 5, 6].map((n) => source(n)),
      2048,
    );
    expect(lines).toHaveLength(5);
    expect(lines[0]).toEqual({
      kind: 'booking_found',
      title: 'Booking 1 found in your email',
      sub: 'Two rooms at the villa, both refundable',
      deeplink: 'critterpass://trips/00000000-0000-7000-8000-000000000001/wallet',
    });
  });

  it('drops links, then lines under titles, then rows to fit the budget', () => {
    const noLinks = roundupLines(
      [1, 2, 3, 4, 5].map((n) => source(n)),
      700,
    );
    expect(noLinks.every((line) => line.deeplink === undefined && line.sub !== undefined)).toBe(
      true,
    );
    const titlesOnly = roundupLines(
      [1, 2, 3, 4, 5].map((n) => source(n)),
      400,
    );
    expect(titlesOnly.every((line) => line.sub === undefined)).toBe(true);
    const fewer = roundupLines(
      [1, 2, 3, 4, 5].map((n) => source(n)),
      150,
    );
    expect(fewer.length).toBeLessThan(5);
    expect(jsonBytes(fewer)).toBeLessThanOrEqual(150);
  });

  it('clips long titles and leaves out an empty line under one', () => {
    const [line] = roundupLines([{ ...source(1, ' '), title: 'x'.repeat(80) }]);
    expect([...(line?.title ?? '')]).toHaveLength(40);
    expect(line?.sub).toBeUndefined();
  });
});
