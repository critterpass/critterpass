import { describe, expect, it } from '@jest/globals';

import { spokenLeft } from '../countdown-chip';
import { tripIsLockedIn } from '../slots';

describe('the countdown read aloud', () => {
  it('reads days and hours, then hours and minutes inside the last day', () => {
    expect(spokenLeft('en', { days: 17, hours: 5, minutes: 26 })).toBe('17 days, 5 hours');
    expect(spokenLeft('en', { days: 0, hours: 3, minutes: 2 })).toBe('3 hours, 2 minutes');
  });

  it('leaves out a part that is zero, and still says something in the last minute', () => {
    expect(spokenLeft('en', { days: 2, hours: 0, minutes: 40 })).toBe('2 days');
    expect(spokenLeft('en', { days: 0, hours: 0, minutes: 12 })).toBe('12 minutes');
    expect(spokenLeft('en', { days: 0, hours: 0, minutes: 0 })).toBe('0 minutes');
  });
});

describe('when the next-up card starts counting down', () => {
  it('waits for the lock: not while the plan is drafted or the crew is still answering', () => {
    expect(tripIsLockedIn('draft_review')).toBe(false);
    expect(tripIsLockedIn('proposed')).toBe(false);
    expect(tripIsLockedIn('confirmed')).toBe(true);
    expect(tripIsLockedIn('pre_trip')).toBe(true);
  });
});
