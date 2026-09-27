import { describe, expect, it } from '@jest/globals';

import { createThrottle, TYPING_EXPIRY_MS, TYPING_THROTTLE_MS, TypingRoster } from '../use-typing';

describe('typing throttle', () => {
  it('lets one typing event through per 3 s however fast keys arrive', () => {
    let now = 0;
    const throttle = createThrottle(TYPING_THROTTLE_MS, () => now);
    let sent = 0;
    // A keystroke every 100 ms for 10 s.
    for (now = 0; now < 10_000; now += 100) if (throttle.take()) sent += 1;
    expect(TYPING_THROTTLE_MS).toBe(3000);
    expect(sent).toBe(4); // at 0, 3000, 6000 and 9000 ms
  });
});

describe('TypingRoster', () => {
  it('shows a typist for 5 s after their latest event', () => {
    const roster = new TypingRoster();
    roster.mark('a', 0);
    roster.mark('b', 2000);
    expect(TYPING_EXPIRY_MS).toBe(5000);
    expect(roster.active(4999)).toEqual(['a', 'b']);
    expect(roster.nextExpiry()).toBe(5000);
    expect(roster.active(5000)).toEqual(['b']);
    roster.mark('b', 6000);
    expect(roster.active(8000)).toEqual(['b']);
    expect(roster.active(11_000)).toEqual([]);
    expect(roster.nextExpiry()).toBeUndefined();
  });
});
