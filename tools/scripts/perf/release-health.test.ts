import { describe, expect, it } from 'vitest';

import { healthVerdict, parseSessions } from './release-health';

describe('release health', () => {
  const body = (rate: number | null, sessions: number) => ({
    groups: [{ by: {}, totals: { 'crash_free_rate(session)': rate, 'sum(session)': sessions } }],
  });

  it('reads the crash-free rate as a percentage', () => {
    expect(parseSessions(body(0.9961, 1200))).toEqual({ sessions: 1200, crashFreePercent: 99.61 });
    expect(parseSessions(body(null, 0))).toEqual({ sessions: 0, crashFreePercent: undefined });
    expect(parseSessions({ groups: [] })).toEqual({ sessions: 0, crashFreePercent: undefined });
  });

  it('halts below the line, passes on it, and waits when sessions are few', () => {
    expect(healthVerdict({ sessions: 500, crashFreePercent: 99.5 }, 99.5, 200)).toBe('healthy');
    expect(healthVerdict({ sessions: 500, crashFreePercent: 99.49 }, 99.5, 200)).toBe('halt');
    expect(healthVerdict({ sessions: 199, crashFreePercent: 90 }, 99.5, 200)).toBe(
      'not-enough-data',
    );
    expect(healthVerdict({ sessions: 0, crashFreePercent: undefined }, 99.5, 200)).toBe(
      'not-enough-data',
    );
  });
});
