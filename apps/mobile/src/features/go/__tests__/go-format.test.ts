/** GO's short forms: hours past the hour ("1H44") and Grab's fare range in compact money. */
import { describe, expect, it } from '@jest/globals';

import { compactFareRange, durationParts } from '../go-format';

const UNITS = { thousand: 'K', million: 'M', billion: 'B' };

describe('GO durations', () => {
  it('keeps minutes under the hour and turns the rest into hours and padded minutes', () => {
    expect(durationParts(59)).toEqual({ kind: 'minutes', minutes: 59 });
    expect(durationParts(60)).toEqual({ kind: 'hours', hours: 1, rest: '00' });
    expect(durationParts(104)).toEqual({ kind: 'hours', hours: 1, rest: '44' });
    expect(durationParts(137)).toEqual({ kind: 'hours', hours: 2, rest: '17' });
  });
});

describe("Grab's fare range", () => {
  it('writes the symbol once and both ends in the high end’s unit', () => {
    expect(
      compactFareRange({ lowMinor: 95000, highMinor: 120000, currency: 'VND' }, 'en', UNITS),
    ).toBe('₫95K–120K');
    expect(
      compactFareRange({ lowMinor: 900000, highMinor: 1200000, currency: 'VND' }, 'en', UNITS),
    ).toBe('₫0.9M–1.2M');
  });

  it('reads minor units by the currency’s own exponent', () => {
    expect(
      compactFareRange({ lowMinor: 1250, highMinor: 1800, currency: 'SGD' }, 'en', UNITS),
    ).toMatch(/^\S*12\.5–18$/u);
  });
});
