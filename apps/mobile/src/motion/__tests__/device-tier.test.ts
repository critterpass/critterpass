import { describe, expect, it } from '@jest/globals';

import { tierFromTotalMemory } from '../device-tier';

const GB = 1024 * 1024 * 1024;

describe('tierFromTotalMemory', () => {
  it('classifies low-tier at 3 GB or less', () => {
    expect(tierFromTotalMemory(2 * GB)).toBe('low');
    expect(tierFromTotalMemory(3 * GB)).toBe('low');
  });

  it('classifies mid-tier above 3 GB up to 6 GB', () => {
    expect(tierFromTotalMemory(3 * GB + 1)).toBe('mid');
    expect(tierFromTotalMemory(6 * GB)).toBe('mid');
  });

  it('classifies high-tier above 6 GB', () => {
    expect(tierFromTotalMemory(8 * GB)).toBe('high');
  });

  it('defaults to mid-tier when the platform cannot report memory (web, expo-device null)', () => {
    expect(tierFromTotalMemory(null)).toBe('mid');
  });
});
