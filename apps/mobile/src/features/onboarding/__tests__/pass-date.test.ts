import { describe, expect, it } from '@jest/globals';

import { passDate } from '../pass-facts';

const at = new Date(2026, 9, 14, 12);

describe('the pass issue date', () => {
  it('prints day, month, year in a locale that writes the month first', () => {
    expect(passDate('en-US', at)).toBe('14 Oct 2026');
  });

  it('keeps day, month, year where the locale already prints it so', () => {
    expect(passDate('en-GB', at)).toBe('14 Oct 2026');
  });

  it('keeps the year-first form of a locale that writes the year first', () => {
    expect(passDate('ja', at)).toMatch(/^2026/);
  });
});
