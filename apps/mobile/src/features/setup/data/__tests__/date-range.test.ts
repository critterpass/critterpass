/**
 * Setup's date ranges, with and without the engine's `formatRange` (Hermes has none): one day,
 * inside one month in the locale's own order, and across months.
 */
import { afterEach, describe, expect, it } from '@jest/globals';

import { dayRange } from '../date-range';

const proto = Intl.DateTimeFormat.prototype as { formatRange?: unknown };
const native = proto.formatRange;

afterEach(() => {
  proto.formatRange = native;
});

describe('setup date ranges', () => {
  it('builds ranges without formatRange, as on Hermes', () => {
    delete proto.formatRange;
    expect(dayRange('en', '2027-04-02', '2027-04-09')).toBe('Apr 2–9');
    expect(dayRange('en', '2027-04-30', '2027-05-03')).toBe('Apr 30 – May 3');
    expect(dayRange('en', '2027-04-02', '2027-04-02')).toBe('Apr 2');
    expect(dayRange('vi', '2027-04-02', '2027-04-09')).toContain('2–9');
  });

  it('uses the engine’s own range format when it has one', () => {
    expect(dayRange('en', '2027-04-02', '2027-04-09')).toMatch(/Apr 2\s?–\s?9/u);
  });
});
