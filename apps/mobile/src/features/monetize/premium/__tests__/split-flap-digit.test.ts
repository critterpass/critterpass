import { describe, expect, it } from '@jest/globals';

import { flapFontSize } from '../components/split-flap-digit';

describe('split-flap digit size', () => {
  it('keeps the designed size for one digit', () => {
    expect(flapFontSize('3', 120, 150)).toBeCloseTo(150 * 0.73);
  });

  it('steps a two-digit count down so it keeps room at both sides of the tile', () => {
    const one = flapFontSize('3', 120, 150);
    const two = flapFontSize('10', 120, 150);
    expect(two).toBeLessThan(one);
    // Two glyphs at about half an em each fill no more than three quarters of the tile.
    expect(2 * 0.52 * two).toBeLessThanOrEqual(120 * 0.75);
  });
});
