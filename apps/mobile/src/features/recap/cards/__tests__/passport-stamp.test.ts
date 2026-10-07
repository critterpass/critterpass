/**
 * The trip's stamp lands clear of the older stamp in the page's corner on every phone width, and a
 * line set along the ring never runs past its sweep.
 */
import { describe, expect, it } from '@jest/globals';

import { arcStep, stampDrop } from '../passport-stamp';

const SIZE = 230;
const OLDER = 104;
const GAP = 8;

describe('the stamp beside an older one', () => {
  it('drops until the two rings are the gap apart, on narrow and wide pages', () => {
    for (const field of [280, 335, 350, 390, 480]) {
      const drop = stampDrop(field, SIZE, OLDER, GAP);
      const across = field / 2 - OLDER / 2;
      const down = drop + SIZE / 2 - OLDER / 2;
      expect(Math.hypot(across, down)).toBeGreaterThanOrEqual(SIZE / 2 + OLDER / 2 + GAP);
      // And no further than that where it had to drop: the page has little height to spare.
      if (drop > 0) {
        expect(Math.hypot(across, down - 1)).toBeLessThan(SIZE / 2 + OLDER / 2 + GAP);
      }
    }
  });

  it('does not drop when the page is wide enough to clear it side by side', () => {
    expect(stampDrop(800, SIZE, OLDER, GAP)).toBe(0);
  });
});

describe('a line along the ring', () => {
  it('turns by its letter width, and tightens when the line is long', () => {
    expect(arcStep(1, 9, 80)).toBe(0);
    expect(arcStep(6, 9, 80)).toBeCloseTo((9 / 80) * (180 / Math.PI));
    expect(arcStep(40, 9, 80) * 39).toBeCloseTo(150);
  });
});
