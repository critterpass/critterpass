import { describe, expect, it } from 'vitest';

import {
  generateJoinCode,
  isJoinCode,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  normalizeJoinCode,
} from '../codes';

const AMBIGUOUS = ['0', 'O', '1', 'I', 'L', 'U'];

/** Wilson–Hilferty upper quantile of χ² with `k` degrees of freedom for a one-sided z-score. */
function chiSquareCritical(k: number, z: number): number {
  const a = 2 / (9 * k);
  return k * (1 - a + z * Math.sqrt(a)) ** 3;
}

describe('join code alphabet', () => {
  it('is Crockford base32 without any look-alike glyph', () => {
    expect(JOIN_CODE_ALPHABET).toHaveLength(30);
    expect(new Set(JOIN_CODE_ALPHABET).size).toBe(30);
    for (const glyph of AMBIGUOUS) expect(JOIN_CODE_ALPHABET).not.toContain(glyph);
  });
});

describe('generateJoinCode', () => {
  it('spreads 100k codes evenly over the alphabet (chi-square) and never emits a look-alike', () => {
    const counts = new Map<string, number>();
    const positionCounts = Array.from(
      { length: JOIN_CODE_LENGTH },
      () => new Map<string, number>(),
    );
    const total = 100_000;
    for (let n = 0; n < total; n += 1) {
      const code = generateJoinCode();
      if (code.length !== JOIN_CODE_LENGTH) throw new Error(`bad length: ${code}`);
      [...code].forEach((glyph, position) => {
        counts.set(glyph, (counts.get(glyph) ?? 0) + 1);
        const perPosition = positionCounts[position];
        perPosition?.set(glyph, (perPosition.get(glyph) ?? 0) + 1);
      });
    }
    for (const glyph of counts.keys()) expect(JOIN_CODE_ALPHABET).toContain(glyph);

    // One-in-a-million false-alarm rate: a real bias (like a modulo skew) blows far past it.
    const critical = chiSquareCritical(JOIN_CODE_ALPHABET.length - 1, 4.753);
    const chiSquare = (observed: Map<string, number>, draws: number) => {
      const expected = draws / JOIN_CODE_ALPHABET.length;
      return [...JOIN_CODE_ALPHABET].reduce((sum, glyph) => {
        const diff = (observed.get(glyph) ?? 0) - expected;
        return sum + (diff * diff) / expected;
      }, 0);
    };
    expect(chiSquare(counts, total * JOIN_CODE_LENGTH)).toBeLessThan(critical);
    for (const perPosition of positionCounts) {
      expect(chiSquare(perPosition, total)).toBeLessThan(critical);
    }
  }, 60_000);

  it('redraws bytes past the rejection limit instead of folding them onto low glyphs', () => {
    // 240 = 8 × 30 is the first byte the modulo would bias; every such byte must be skipped.
    let call = 0;
    const code = generateJoinCode((bytes) => {
      bytes.fill(call === 0 ? 255 : 31);
      call += 1;
      return bytes;
    });
    expect(call).toBe(2);
    expect(code).toBe(JOIN_CODE_ALPHABET[1]?.repeat(JOIN_CODE_LENGTH));
  });
});

describe('normalizeJoinCode', () => {
  it('upper-cases and drops spaces and dashes', () => {
    expect(normalizeJoinCode(' k7m-2qx ')).toBe('K7M2QX');
    expect(normalizeJoinCode('k7m 2qx')).toBe('K7M2QX');
  });

  it.each(['K7M2Q0', 'K7M2QO', 'K7M2Q1', 'K7M2QI', 'K7M2QL', 'K7M2QU'])(
    'rejects look-alike glyphs rather than guessing (%s)',
    (input) => {
      expect(normalizeJoinCode(input)).toBeNull();
    },
  );

  it('rejects wrong lengths and foreign characters', () => {
    expect(normalizeJoinCode('K7M2Q')).toBeNull();
    expect(normalizeJoinCode('K7M2QXA')).toBeNull();
    expect(normalizeJoinCode('K7M2Q!')).toBeNull();
    expect(isJoinCode('k7m2qx')).toBe(false);
  });
});
