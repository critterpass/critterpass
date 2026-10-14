import { describe, expect, it } from '@jest/globals';

import { tripDates } from '../format';

describe('the whole trip’s dates', () => {
  it('joins a same-month range in the locale’s own day order', () => {
    expect(tripDates('en-US', '2026-10-12', '2026-10-19')).toBe('Oct 12–19');
    expect(tripDates('en-GB', '2026-11-05', '2026-11-11')).toBe('5–11 Nov');
  });

  it('shows both dates across months, and one for a single day', () => {
    expect(tripDates('en-US', '2026-10-30', '2026-11-02')).toBe('Oct 30 – Nov 2');
    expect(tripDates('en-US', '2026-10-12', null)).toBe('Oct 12');
  });
});
