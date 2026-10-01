import { describe, expect, it } from '@jest/globals';

import { contrastRatio, tokens } from '@cp/design-tokens';

import { composite, duotoneMatrix, mixColour, treatmentFor } from '../duotone';

const INK = tokens.color.ink['850'];
const CREAM = tokens.color.paper.base;
/** Every accent a hero floods with. */
const ACCENTS = [
  tokens.color.yellow,
  tokens.color.pink,
  tokens.color.blue,
  tokens.color.green.base,
  tokens.color.orange,
  tokens.color.gold.base,
];
const BLACK = tokens.color.ink['950'];
const WHITE = tokens.color.paper.bright;

describe('duotone treatment', () => {
  it.each(ACCENTS)('keeps ink text readable on the %s hero wherever the photo lands', (accent) => {
    const t = treatmentFor('accent', accent, INK);
    for (const tone of [t.shadow, t.highlight]) {
      expect(contrastRatio(INK, composite(tone, t.base, t.opacity))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(ACCENTS)('keeps the %s title and cream text readable on the dark header', (accent) => {
    const t = treatmentFor('dark', accent, INK);
    const scrim = t.scrim!;
    for (const tone of [t.shadow, t.highlight]) {
      const photo = composite(tone, t.base, t.opacity);
      const title = mixColour(photo, INK, scrim.title);
      expect(contrastRatio(accent, title)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(CREAM, title)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(CREAM, mixColour(photo, INK, scrim.eyebrow))).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it.each(ACCENTS)('shows the photo on the %s header brighter than its text scrim', (accent) => {
    const t = treatmentFor('dark', accent, INK);
    expect(t.opacity).toBe(1);
    expect(t.scrim!.eyebrow).toBeLessThanOrEqual(t.scrim!.title);
    expect(t.scrim!.title).toBeLessThan(1);
  });

  it('maps black to the shadow and white to the highlight', () => {
    const m = duotoneMatrix(INK, CREAM);
    const apply = (r: number, g: number, b: number) =>
      [0, 1, 2].map((row) =>
        Math.round(
          255 * (m[row * 5]! * r + m[row * 5 + 1]! * g + m[row * 5 + 2]! * b + m[row * 5 + 4]!),
        ),
      );
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(apply(0, 0, 0)).toEqual(rgb(INK));
    expect(apply(1, 1, 1)).toEqual(rgb(CREAM));
    expect(m.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });

  it('mixes colours in sRGB', () => {
    const mid = mixColour(BLACK, WHITE, 0.5);
    expect(contrastRatio(mid, BLACK)).toBeGreaterThan(3);
    expect(contrastRatio(mid, WHITE)).toBeGreaterThan(2);
  });
});
