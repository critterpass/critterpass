/**
 * Dropping an idea on a day: the chip under the finger, at the chips' edges and in the gaps
 * between them, with the slop above and below the row, and on a row scrolled sideways.
 */
import { describe, expect, it } from '@jest/globals';

import { DROP_SLOP, dragHit } from '../drag-hit';

const FRAME = { x: 20, y: 200, width: 350, height: 50 };
// Eight chips sharing 350 pt with 6 pt gaps: each 38.5 pt wide, a new one every 44.5 pt.
const SHARED = { count: 8, gap: 6, slotWidth: null, scrollX: 0 };

describe('dragHit', () => {
  it('finds the chip under the finger, edges included', () => {
    expect(dragHit(FRAME, SHARED, 20, 225)).toBe(0);
    expect(dragHit(FRAME, SHARED, 20 + 38.5, 225)).toBe(0);
    expect(dragHit(FRAME, SHARED, 20 + 44.5, 225)).toBe(1);
    expect(dragHit(FRAME, SHARED, 370, 225)).toBe(7);
  });

  it('gives a finger in a gap to the nearer chip', () => {
    expect(dragHit(FRAME, SHARED, 20 + 38.5 + 2, 225)).toBe(0);
    expect(dragHit(FRAME, SHARED, 20 + 38.5 + 4, 225)).toBe(1);
  });

  it('counts a little above and below the row, and nothing further away', () => {
    expect(dragHit(FRAME, SHARED, 100, 200 - DROP_SLOP)).toBe(1);
    expect(dragHit(FRAME, SHARED, 100, 250 + DROP_SLOP)).toBe(1);
    expect(dragHit(FRAME, SHARED, 100, 200 - DROP_SLOP - 1)).toBe(-1);
    expect(dragHit(FRAME, SHARED, 100, 400)).toBe(-1);
    expect(dragHit(FRAME, SHARED, 10, 225)).toBe(-1);
  });

  it('reads a scrolled row by its offset', () => {
    const scrolled = { count: 12, gap: 6, slotWidth: 44, scrollX: 100 };
    // 100 pt scrolled: the row's left edge shows the third chip (each 50 pt apart).
    expect(dragHit(FRAME, scrolled, 20, 225)).toBe(2);
    expect(dragHit(FRAME, scrolled, 20 + 350, 225)).toBe(9);
  });
});
