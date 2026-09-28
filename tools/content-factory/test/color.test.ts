import { describe, expect, it } from 'vitest';

import { contrastRatio, deltaE2000, hexToOklch, oklchToHex, rotateHue } from '../src/color/color';

describe('colour maths', () => {
  it('scores identical colours 0, black against white about 100 and near colours low', () => {
    expect(deltaE2000('#336699', '#336699')).toBe(0);
    expect(deltaE2000('#000000', '#ffffff')).toBeCloseTo(100, 0);
    expect(deltaE2000('#ff0000', '#ff1010')).toBeLessThan(5);
  });

  it('round-trips OKLCH and rotates hue', () => {
    expect(oklchToHex(hexToOklch('#54d6a4'))).toBe('#54d6a4');
    const rotated = rotateHue('#54d6a4', 180);
    expect(Math.abs(hexToOklch(rotated).h - ((hexToOklch('#54d6a4').h + 180) % 360))).toBeLessThan(
      3,
    );
  });

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
});
