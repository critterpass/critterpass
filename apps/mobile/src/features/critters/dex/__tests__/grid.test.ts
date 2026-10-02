/**
 * The set page's grid always fits three tiles a row: the tiles and the gaps between them never add
 * up to more than the row, at any phone width, so a third tile never wraps to the next row.
 */
import { describe, expect, it } from '@jest/globals';

import { gridTileWidth, SET_GRID_COLUMNS } from '../grid';

describe('set grid', () => {
  it('fits three tiles and two gaps in the row at every phone width', () => {
    for (const width of [296.5, 320, 343, 345.33, 358, 361, 375, 390.4, 402, 430, 440]) {
      const tile = gridTileWidth(width, 10);
      expect(tile * SET_GRID_COLUMNS + 10 * (SET_GRID_COLUMNS - 1)).toBeLessThanOrEqual(width);
      // And no more than a point short of filling it.
      expect(width - (tile * SET_GRID_COLUMNS + 20)).toBeLessThan(SET_GRID_COLUMNS);
    }
  });

  it('has no tile width before the row is laid out', () => {
    expect(gridTileWidth(0, 10)).toBe(0);
    expect(gridTileWidth(-5, 10)).toBe(0);
  });
});
