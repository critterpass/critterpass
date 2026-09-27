import { describe, expect, it } from '@jest/globals';

import { dataOf, formatSeen, seenAgo } from '../freshness';

const NOW = new Date('2026-09-28T12:00:00Z');

describe('seenAgo', () => {
  it('counts whole minutes, hours and days, and calls under a minute now', () => {
    expect(seenAgo('2026-09-28T11:59:30Z', NOW)).toEqual({ unit: 'now', count: 0 });
    expect(seenAgo('2026-09-28T11:05:00Z', NOW)).toEqual({ unit: 'minute', count: 55 });
    expect(seenAgo('2026-09-28T09:00:00Z', NOW)).toEqual({ unit: 'hour', count: 3 });
    expect(seenAgo('2026-09-25T11:00:00Z', NOW)).toEqual({ unit: 'day', count: 3 });
  });

  it('never goes negative for a clock slightly ahead', () => {
    expect(seenAgo('2026-09-28T12:00:05Z', NOW)).toEqual({ unit: 'now', count: 0 });
  });
});

describe('formatSeen', () => {
  it('renders the relative part of "seen 3h ago" in the reader locale', () => {
    expect(formatSeen('2026-09-28T09:00:00Z', NOW)).toBe('3h ago');
    expect(formatSeen('2026-09-28T11:59:30Z', NOW)).toBe('now');
    expect(formatSeen('2026-09-28T09:00:00Z', NOW, 'vi')).not.toBe('3h ago');
  });
});

describe('dataOf', () => {
  it('returns data for ok and stale states only', () => {
    expect(dataOf({ status: 'ok', data: 1, seenAt: null, source: 'network' })).toBe(1);
    expect(
      dataOf({ status: 'stale', data: 2, seenAt: null, source: 'cache', reason: 'offline' }),
    ).toBe(2);
    expect(dataOf({ status: 'missing', reason: 'offline' })).toBeUndefined();
    expect(dataOf({ status: 'loading' })).toBeUndefined();
  });
});
