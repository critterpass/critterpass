/**
 * The whole trip's dates. Node formats ranges itself (with thin spaces round the dash) where the
 * phone's engine joins the parts, so the shape is compared without the spacing.
 */
import { describe, expect, it } from '@jest/globals';

import { tripDates } from '../format';

const shape = (text: string) => text.replace(/\s/gu, '');

describe('the whole trip’s dates', () => {
  it('joins a same-month range in the locale’s own day order', () => {
    expect(shape(tripDates('en-US', '2026-10-12', '2026-10-19'))).toBe('Oct12–19');
    expect(shape(tripDates('en-GB', '2026-11-05', '2026-11-11'))).toBe('5–11Nov');
  });

  it('shows both dates across months, and one for a single day', () => {
    expect(shape(tripDates('en-US', '2026-10-30', '2026-11-02'))).toBe('Oct30–Nov2');
    expect(tripDates('en-US', '2026-10-12', null)).toBe('Oct 12');
  });
});
