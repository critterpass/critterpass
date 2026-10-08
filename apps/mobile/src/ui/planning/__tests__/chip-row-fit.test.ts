import { describe, expect, it } from '@jest/globals';

import { chipScrollOffset, chipsFit } from '../chip-row-fit';

/** The day chips' sizes: 40 pt at least when sharing the row, 44 pt when scrolling, 6 pt apart. */
const MIN = 40;
const WIDE = 44;
const GAP = 6;
/** The row inside the gutters of a 375 pt phone. */
const ROW = 335;

describe('day chips sharing a row', () => {
  it('fits a week and scrolls from eight days on a narrow phone', () => {
    expect(chipsFit(7, ROW, MIN, GAP)).toBe(true);
    // 8 × 40 + 7 × 6 = 362 pt: wider than the row, so the last chip would be cut.
    expect(chipsFit(8, ROW, MIN, GAP)).toBe(false);
    expect(chipsFit(8, 362, MIN, GAP)).toBe(true);
    expect(chipsFit(12, ROW, MIN, GAP)).toBe(false);
  });
});

describe('the chosen day on a scrolling row', () => {
  const at = (index: number) =>
    chipScrollOffset({ index, count: 12, rowWidth: ROW, chipWidth: WIDE, gap: GAP });
  const chipStart = (index: number) => index * (WIDE + GAP);

  it('leaves the first days where they are', () => {
    expect(at(0)).toBe(0);
    expect(at(2)).toBe(0);
  });

  it('brings a later day wholly into view', () => {
    for (const index of [7, 9, 11]) {
      const offset = at(index);
      expect(chipStart(index)).toBeGreaterThanOrEqual(offset);
      expect(chipStart(index) + WIDE).toBeLessThanOrEqual(offset + ROW);
    }
  });

  it('never scrolls past the last day', () => {
    const content = 12 * WIDE + 11 * GAP;
    expect(at(11)).toBe(content - ROW);
  });

  it('stays put with no chosen day or an unmeasured row', () => {
    expect(at(-1)).toBe(0);
    expect(chipScrollOffset({ index: 9, count: 12, rowWidth: 0, chipWidth: WIDE, gap: GAP })).toBe(
      0,
    );
  });
});
