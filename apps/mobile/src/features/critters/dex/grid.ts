/**
 * The set page's critter grid (3l-8): three tiles a row, sized in points from the grid's own laid
 * out width. Percentage widths and gaps (31% tiles, 3.5% gaps) add up to exactly 100%, and iOS
 * resolves them so the third tile no longer fits, leaving two columns and an empty right half.
 */
export const SET_GRID_COLUMNS = 3;

/** Each tile's width: the row's width less the gaps, shared out and floored to whole points. */
export function gridTileWidth(
  width: number,
  gap: number,
  columns: number = SET_GRID_COLUMNS,
): number {
  if (width <= 0 || columns < 1) return 0;
  return Math.max(0, Math.floor((width - gap * (columns - 1)) / columns));
}
