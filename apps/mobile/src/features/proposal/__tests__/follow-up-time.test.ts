/**
 * "Ask me later" lands before the answer is due and is named for what it is: never "Sunday" on a
 * Sunday, never after the reply-by date, and not offered at all when the answer is due too soon.
 */
import { describe, expect, it } from '@jest/globals';

import { followUpAt } from '../objection/options';

/** A device-clock instant: these run in whatever zone the runner is in. */
const at = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h, 0, 0, 0);
const iso = (date: Date) => date.toISOString();

describe('ask me later', () => {
  // 4 Oct 2026 is a Sunday.
  it('is tonight on a Sunday afternoon with the answer due tomorrow', () => {
    const now = at(2026, 10, 4, 14);
    expect(followUpAt(now, iso(at(2026, 10, 5, 21)))).toEqual({
      when: 'tonight',
      atLocal: '2026-10-04T19:00',
    });
  });

  it('is tomorrow morning once this evening has passed', () => {
    const now = at(2026, 10, 4, 21);
    expect(followUpAt(now, iso(at(2026, 10, 5, 21)))).toEqual({
      when: 'tomorrow',
      atLocal: '2026-10-05T09:00',
    });
  });

  it('is the coming Sunday when the answer is not due before it', () => {
    const now = at(2026, 10, 1, 10);
    expect(followUpAt(now, iso(at(2026, 10, 8, 12)))).toEqual({
      when: 'sunday',
      atLocal: '2026-10-04T19:00',
    });
    expect(followUpAt(now, null)?.when).toBe('sunday');
  });

  it('skips a Sunday that falls after the reply-by date', () => {
    const now = at(2026, 10, 1, 10);
    expect(followUpAt(now, iso(at(2026, 10, 3, 12)))).toEqual({
      when: 'tonight',
      atLocal: '2026-10-01T19:00',
    });
  });

  it('offers nothing when the answer is due within hours', () => {
    const now = at(2026, 10, 4, 14);
    expect(followUpAt(now, iso(at(2026, 10, 4, 18)))).toBeNull();
  });

  it('is tomorrow morning with no deadline once this Sunday evening has passed', () => {
    const now = at(2026, 10, 4, 20);
    expect(followUpAt(now, null)).toEqual({ when: 'tomorrow', atLocal: '2026-10-05T09:00' });
  });
});
