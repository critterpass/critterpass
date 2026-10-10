import { describe, expect, it } from 'vitest';

import { ftfDaysLeft, ftfEndingDue, ftfEndingRemindAt } from './ftf-ending';

const ENDS = new Date('2026-10-26T00:00:00Z');

describe('free first trip ending', () => {
  it('reminds three days before the window closes', () => {
    expect(ftfEndingRemindAt(ENDS).toISOString()).toBe('2026-10-23T00:00:00.000Z');
  });

  it('is due only in the last three days of an open window', () => {
    expect(ftfEndingDue(ENDS, new Date('2026-10-22T00:00:00Z'))).toBe(false);
    expect(ftfEndingDue(ENDS, new Date('2026-10-22T23:30:00Z'))).toBe(true);
    expect(ftfEndingDue(ENDS, new Date('2026-10-25T23:59:00Z'))).toBe(true);
    expect(ftfEndingDue(ENDS, ENDS)).toBe(false);
  });

  it('counts whole days left, rounding up', () => {
    expect(ftfDaysLeft(ENDS, new Date('2026-10-23T00:00:00Z'))).toBe(3);
    expect(ftfDaysLeft(ENDS, new Date('2026-10-23T06:00:00Z'))).toBe(3);
    expect(ftfDaysLeft(ENDS, new Date('2026-10-25T06:00:00Z'))).toBe(1);
    expect(ftfDaysLeft(ENDS, new Date('2026-10-27T00:00:00Z'))).toBe(0);
  });
});
