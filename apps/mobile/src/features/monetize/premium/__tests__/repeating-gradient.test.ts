import { describe, expect, it, jest } from '@jest/globals';

import {
  BOOST_STRIPE,
  GUILLOCHE,
  PAUSE_HATCH,
  paperGrain,
  repeatingLinearGradient,
} from '../repeating-gradient';

// React Native's own parser decides whether a gradient paints at all (on both platforms).
const { default: paints } = jest.requireActual<{
  default: (value: string) => readonly { readonly colorStops: readonly unknown[] }[];
}>('react-native/Libraries/StyleSheet/processBackgroundImage');

describe('repeating gradients', () => {
  it('the repeating form paints nothing, so the patterns are written as plain gradients', () => {
    expect(paints('repeating-linear-gradient(90deg, red 0 10px, blue 10px 14px)')).toEqual([]);
    for (const pattern of [BOOST_STRIPE, GUILLOCHE, PAUSE_HATCH, paperGrain()]) {
      expect(paints(pattern)).toHaveLength(1);
    }
  });

  it('repeats every band until the length is covered', () => {
    const stripe = repeatingLinearGradient(
      90,
      [
        { color: 'red', width: 10 },
        { color: 'blue', width: 4 },
      ],
      28,
    );
    // Two periods of two bands, each band a hard start and end stop.
    expect(paints(stripe)[0]?.colorStops).toHaveLength(8);
    expect(stripe).toContain('blue 24px, blue 28px');
    expect(paperGrain(60)).toContain(' 54px');
    expect(paperGrain(60)).not.toContain(' 60px,');
  });

  it('draws nothing for an empty period', () => {
    expect(repeatingLinearGradient(0, [], 100)).toBe('none');
  });
});
