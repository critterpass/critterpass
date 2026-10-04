import { describe, expect, it } from '@jest/globals';

import { MAP_SHEET_FLING_PT_PER_MS, mapSheetHeights, resolveSnap } from '../map-sheet-snap';

const POINTS = [300, 452, 780] as const;
const FLING = MAP_SHEET_FLING_PT_PER_MS;

describe('resolveSnap', () => {
  it('settles a slow release on the nearest snap', () => {
    expect(resolveSnap(310, 0, POINTS)).toBe(0);
    expect(resolveSnap(370, 0.1, POINTS)).toBe(0);
    expect(resolveSnap(380, -0.1, POINTS)).toBe(1);
    expect(resolveSnap(600, 0, POINTS)).toBe(1);
    expect(resolveSnap(640, 0, POINTS)).toBe(2);
  });

  it('moves a fling up to the next snap above where it was let go', () => {
    expect(resolveSnap(300, -FLING, POINTS)).toBe(1);
    expect(resolveSnap(320, -FLING * 2, POINTS)).toBe(1);
    expect(resolveSnap(452, -FLING, POINTS)).toBe(2);
    expect(resolveSnap(460, -FLING, POINTS)).toBe(2);
  });

  it('moves a fling down to the next snap below where it was let go', () => {
    expect(resolveSnap(780, FLING, POINTS)).toBe(1);
    expect(resolveSnap(760, FLING, POINTS)).toBe(1);
    expect(resolveSnap(452, FLING, POINTS)).toBe(0);
    expect(resolveSnap(440, FLING * 3, POINTS)).toBe(0);
  });

  it('a fling just under the threshold is a plain release', () => {
    expect(resolveSnap(320, -FLING + 0.01, POINTS)).toBe(0);
    expect(resolveSnap(760, FLING - 0.01, POINTS)).toBe(2);
  });

  it('stays inside the snaps at both ends', () => {
    expect(resolveSnap(780, -FLING, POINTS)).toBe(2);
    expect(resolveSnap(900, 0, POINTS)).toBe(2);
    expect(resolveSnap(300, FLING, POINTS)).toBe(0);
    expect(resolveSnap(100, 0, POINTS)).toBe(0);
    expect(resolveSnap(500, 0, [])).toBe(0);
  });

  it('treats snaps the content collapsed together as one', () => {
    const collapsed = [300, 300, 300];
    expect(resolveSnap(300, -FLING, collapsed)).toBe(2);
    expect(resolveSnap(300, FLING, collapsed)).toBe(0);
    expect(collapsed[resolveSnap(280, 0, collapsed)]).toBe(300);
  });
});

describe('mapSheetHeights', () => {
  it('scales the design snaps to the screen and leaves the top inset of map at full', () => {
    expect(mapSheetHeights(844, 64)).toEqual([300, 452, 780]);
    const small = mapSheetHeights(667, 40);
    expect(small[0]).toBeLessThan(300);
    expect(small[2]).toBe(627);
  });

  it('caps every snap at content shorter than it', () => {
    expect(mapSheetHeights(844, 64, 360)).toEqual([300, 360, 360]);
    expect(mapSheetHeights(844, 64, 200)).toEqual([200, 200, 200]);
    expect(mapSheetHeights(844, 64, 2000)).toEqual([300, 452, 780]);
  });
});
