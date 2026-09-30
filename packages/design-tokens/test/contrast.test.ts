import { describe, expect, it } from 'vitest';

import { contrastRatio, darkenToContrast, parseColor, relativeLuminance } from '../src/contrast';
import { contrastPairs, tokens } from '../src/validate';

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#ffd84a')).toEqual({ r: 255, g: 216, b: 74 });
  });

  it('parses 3-digit hex by doubling each channel', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('parses rgba() ignoring alpha', () => {
    expect(parseColor('rgba(255,255,255,.07)')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('throws on an unsupported format', () => {
    expect(() => parseColor('cream')).toThrow(/cannot parse colour literal/);
  });
});

describe('relativeLuminance and contrastRatio', () => {
  it('gives black and white the maximum 21:1 ratio', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('is symmetric regardless of argument order', () => {
    expect(contrastRatio('#17142a', '#f4efe4')).toBeCloseTo(
      contrastRatio('#f4efe4', '#17142a'),
      10,
    );
  });

  it('gives identical colours a 1:1 ratio', () => {
    expect(contrastRatio('#4f86ff', '#4f86ff')).toBeCloseTo(1, 5);
  });
});

describe('darkenToContrast', () => {
  it('is a no-op when the input already clears the threshold', () => {
    expect(darkenToContrast('#000000', '#ffffff', 4.5)).toBe('#000000');
  });

  it('darkens a bright colour until it reaches the requested ratio against a light background', () => {
    const darkened = darkenToContrast('#ffd84a', '#f4efe4', 4.5);
    expect(contrastRatio(darkened, '#f4efe4')).toBeGreaterThanOrEqual(4.5);
  });

  it('matches the design system’s own darkened-rust example within the same contrast class', () => {
    // design-system.md §1.1: rust #c4623e is only safe on paper at 24pt+ (large text, 3:1); the
    // documented darkened variant #a44e2f is meant for normal text (4.5:1). Cross-checking both
    // confirms this module's luminance maths agrees with the human-picked reference value.
    expect(contrastRatio('#c4623e', '#f4efe4')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio('#c4623e', '#f4efe4')).toBeLessThan(4.5);
    expect(contrastRatio('#a44e2f', '#f4efe4')).toBeGreaterThanOrEqual(4.5);
  });

  it('is deterministic: the same inputs always produce the same output', () => {
    expect(darkenToContrast('#54d6a4', '#f4efe4', 4.5)).toBe(
      darkenToContrast('#54d6a4', '#f4efe4', 4.5),
    );
  });

  it('throws rather than returning a colour that still fails, when darkening cannot help', () => {
    // The background is already near-black: darkening the (already darker) foreground only pushes
    // both colours closer together, so the ratio can never climb to a near-max target by darkening.
    expect(() => darkenToContrast('#ffd84a', '#0b0a12', 21)).toThrow(/cannot darken/);
  });
});

describe('contrastPairs (design-system.md §5 accessibility contract)', () => {
  it('declares at least one pair per required contrast check', () => {
    expect(contrastPairs.length).toBeGreaterThan(0);
  });

  it.each(contrastPairs.map((pair) => [pair.name, pair] as const))(
    '%s meets its minimum ratio',
    (_name, pair) => {
      expect(contrastRatio(pair.fg, pair.bg)).toBeGreaterThanOrEqual(pair.minRatio);
    },
  );

  it('flags that border.control (#5b5487) measures short of the 3:1 design-system.md §1.2 claims', () => {
    // Tracked gap, not a bug in this package: #5b5487 is the exact, repeated value in
    // design/Critterpass.dc.html, so the fix (if any) is a token edit on founder sign-off, not an
    // invented hex here. This assertion pins today's real ratio so a further regression is caught.
    expect(contrastRatio(tokens.semantic.border.control, tokens.semantic.bg.base)).toBeCloseTo(
      2.618,
      2,
    );
    // The Increase Contrast escape hatch already meets the 3:1 the base colour falls short of.
    expect(
      contrastRatio(tokens.semantic.increaseContrast.borderControl, tokens.semantic.bg.base),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe('guide.onPaper (computed, not hand-picked)', () => {
  it('gives every guide colour a paper-safe text variant', () => {
    for (const id of ['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco', 'chava'] as const) {
      const onPaper = tokens.guide.onPaper[id];
      expect(contrastRatio(onPaper, tokens.color.paper.base)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
