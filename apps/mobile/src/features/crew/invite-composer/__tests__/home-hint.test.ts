import { describe, expect, it } from '@jest/globals';

import { DIAL_CODES } from '@cp/content/onboarding';

import { pickedToE164 } from '../home-hint';

describe('picked numbers', () => {
  it('keeps international numbers as they are', () => {
    expect(pickedToE164('+65 9123 4567', 'VN', DIAL_CODES)).toBe('+6591234567');
    expect(pickedToE164('0065 9123-4567', null, DIAL_CODES)).toBe('+6591234567');
  });

  it('places a local number in the device region, trunk zero dropped', () => {
    expect(pickedToE164('0901 234 567', 'VN', DIAL_CODES)).toBe('+84901234567');
    expect(pickedToE164('(415) 555-0100', 'US', DIAL_CODES)).toBe('+14155550100');
  });

  it('gives up on a local number it cannot place', () => {
    expect(pickedToE164('0901 234 567', null, DIAL_CODES)).toBeNull();
    expect(pickedToE164('0901 234 567', 'ZZ', DIAL_CODES)).toBeNull();
    expect(pickedToE164('12', 'VN', DIAL_CODES)).toBeNull();
  });
});
