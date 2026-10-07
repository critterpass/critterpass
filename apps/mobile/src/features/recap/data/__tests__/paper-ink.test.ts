/**
 * Stamp ink and signature colours on the recap's paper: a stored accent name is the design's
 * colour of that name (never the platform's pure `red` or `yellow`), and every ink reads on paper.
 */
import { contrastRatio, tokens } from '@cp/design-tokens';
import { describe, expect, it } from '@jest/globals';

import { accentHex, inkOnPaper, stampInkOnPaper } from '../paper-ink';

const paper = tokens.color.paper.base;

describe('ink on the recap paper', () => {
  it('reads a stored accent name as its token, with or without a ring pattern', () => {
    expect(accentHex('red')).toBe(tokens.color.red);
    expect(accentHex('yellow/dashed')).toBe(tokens.color.yellow);
    expect(accentHex(tokens.color.blue)).toBe(tokens.color.blue);
    expect(accentHex('chartreuse')).toBeNull();
    expect(accentHex(null)).toBeNull();
  });

  it('darkens every member colour and stamp ink until it reads on paper', () => {
    for (const stored of [
      'yellow',
      'orange',
      'blue',
      'pink',
      'green',
      'cream',
      'red',
      tokens.color.yellow,
    ]) {
      const ink = inkOnPaper(stored, tokens.color.blue);
      expect(ink).toMatch(/^#[0-9a-f]{6}$/u);
      expect(contrastRatio(ink, paper)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('falls back to the guide colour for a missing or unknown one', () => {
    expect(inkOnPaper(null, tokens.guide.chava)).toBe(inkOnPaper(tokens.guide.chava, paper));
    expect(inkOnPaper('chartreuse', 'blue')).toBe(inkOnPaper('blue', paper));
  });

  it("inks a red stamp in the paper's rust, darkened for its small lines", () => {
    for (const stored of ['red', 'red/dashed', tokens.color.red]) {
      expect(stampInkOnPaper(stored, 'blue')).toEqual({
        ink: tokens.color.rust.base,
        lineInk: tokens.color.rust.darkened,
      });
    }
    expect(stampInkOnPaper(null, 'red').ink).toBe(tokens.color.rust.base);
    expect(contrastRatio(tokens.color.rust.darkened, paper)).toBeGreaterThanOrEqual(4.5);
  });

  it('inks any other stamp in its own colour, darkened until it reads', () => {
    const blue = inkOnPaper('blue', paper);
    expect(stampInkOnPaper('blue', 'red')).toEqual({ ink: blue, lineInk: blue });
  });
});
