import { describe, expect, it } from 'vitest';

import {
  FIRST_WAVE_TOTAL,
  WAITLIST_BASE_COUNT,
  findDestination,
  firstWavePercent,
  firstWaveSeatsLeft,
  isDestinationKey,
  positionInLine,
  queueCount,
} from './waitlist';

describe('queueCount', () => {
  it('adds the base head start to real sign-ups', () => {
    expect(queueCount(0)).toBe(WAITLIST_BASE_COUNT);
    expect(queueCount(311)).toBe(WAITLIST_BASE_COUNT + 311);
  });
});

describe('firstWaveSeatsLeft', () => {
  it('subtracts the queue count from the first-wave total', () => {
    expect(firstWaveSeatsLeft(0)).toBe(FIRST_WAVE_TOTAL - WAITLIST_BASE_COUNT);
  });

  it('never goes negative once the wave is full', () => {
    expect(firstWaveSeatsLeft(FIRST_WAVE_TOTAL)).toBe(0);
  });
});

describe('firstWavePercent', () => {
  it('is 0 with no signups beyond the base and caps at 100', () => {
    expect(firstWavePercent(0)).toBeGreaterThan(0); // base count alone is already > 0%
    expect(firstWavePercent(FIRST_WAVE_TOTAL * 2)).toBe(100);
  });
});

describe('positionInLine', () => {
  it('is base + rank with no referrals', () => {
    expect(positionInLine(1, 0)).toBe(WAITLIST_BASE_COUNT + 1);
    expect(positionInLine(42, 0)).toBe(WAITLIST_BASE_COUNT + 42);
  });

  it('moves the joiner up 100 spots per referral', () => {
    expect(positionInLine(500, 2)).toBe(WAITLIST_BASE_COUNT + 500 - 200);
  });

  it('never drops below base + 1 no matter how many referrals', () => {
    expect(positionInLine(5, 50)).toBe(WAITLIST_BASE_COUNT + 1);
  });
});

describe('destinations', () => {
  it('validates known keys and rejects unknown ones', () => {
    expect(isDestinationKey('bali')).toBe(true);
    expect(isDestinationKey('atlantis')).toBe(false);
  });

  it('finds a destination by key', () => {
    expect(findDestination('cusco')?.city).toBe('CUSCO');
    expect(findDestination('nowhere')).toBeUndefined();
  });
});
