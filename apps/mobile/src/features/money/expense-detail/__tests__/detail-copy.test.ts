import { describe, expect, it } from '@jest/globals';

import { changeStampText, expenseDayText } from '../detail-copy';

describe('expense dates', () => {
  it('prints an expense on its trip-local day, never shifted by the phone zone', () => {
    // A coffee at 00:30 on 15 Oct in Đà Nẵng is 14 Oct in UTC and in most of the world.
    expect(expenseDayText('en-GB', '2026-10-15')).toBe('Thu 15 Oct');
    expect(expenseDayText('vi', '2026-10-15')).toContain('15');
    expect(expenseDayText('vi', '2026-10-15')).not.toContain('14');
  });

  it('keeps an unreadable date as written', () => {
    expect(expenseDayText('en-GB', 'soon')).toBe('soon');
  });

  it('stamps a change on the trip clock with its time', () => {
    expect(changeStampText('en-GB', '2026-10-14T17:30:00Z', 'Asia/Ho_Chi_Minh')).toBe(
      '15 Oct, 00:30',
    );
    expect(changeStampText('en-GB', '2026-10-14T17:30:00Z', 'Europe/London')).toBe('14 Oct, 18:30');
    expect(changeStampText('en-GB', 'later', 'Asia/Ho_Chi_Minh')).toBe('');
  });
});
