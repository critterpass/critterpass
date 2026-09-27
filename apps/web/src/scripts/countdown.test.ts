import { describe, expect, it } from 'vitest';

import { formatRemaining } from './countdown';

describe('formatRemaining', () => {
  it('formats days/hours/minutes/seconds', () => {
    const ms = ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000;
    expect(formatRemaining(ms)).toBe('2D 3H 4M 5S');
  });

  it('floors negative or zero remainders to zero', () => {
    expect(formatRemaining(-5000)).toBe('0D 0H 0M 0S');
    expect(formatRemaining(0)).toBe('0D 0H 0M 0S');
  });
});
