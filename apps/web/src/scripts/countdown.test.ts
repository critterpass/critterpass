import { describe, expect, it } from 'vitest';

import { formatRemaining } from './countdown';

const PATTERN = '{days}D {hours}H {minutes}M {seconds}S';

describe('formatRemaining', () => {
  it('formats days/hours/minutes/seconds', () => {
    const ms = ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000;
    expect(formatRemaining(ms, PATTERN)).toBe('2D 3H 4M 5S');
  });

  it('floors negative or zero remainders to zero', () => {
    expect(formatRemaining(-5000, PATTERN)).toBe('0D 0H 0M 0S');
    expect(formatRemaining(0, PATTERN)).toBe('0D 0H 0M 0S');
  });

  it('follows the word order of the page language', () => {
    expect(formatRemaining(90_061_000, '{days}日 {hours}時間 {minutes}分 {seconds}秒')).toBe(
      '1日 1時間 1分 1秒',
    );
  });
});
