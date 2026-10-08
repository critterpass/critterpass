/**
 * A row of day chips either shares the row's width or scrolls sideways. These decide which from
 * the row's measured width, and where a scrolling row has to sit for a given chip to be in view.
 */

/** True when `count` chips of at least `minChip` (with `gap` between) fit in `rowWidth`. */
export function chipsFit(count: number, rowWidth: number, minChip: number, gap: number): boolean {
  if (count <= 0) return true;
  return count * minChip + (count - 1) * gap <= rowWidth;
}

/**
 * The scroll offset that centres chip `index` in a scrolling row, kept inside what the row can
 * scroll: the first chips stay flush with the start and the last with the end.
 */
export function chipScrollOffset(input: {
  readonly index: number;
  readonly count: number;
  readonly rowWidth: number;
  readonly chipWidth: number;
  readonly gap: number;
}): number {
  const { index, count, rowWidth, chipWidth, gap } = input;
  if (index < 0 || count <= 0 || rowWidth <= 0) return 0;
  const content = count * chipWidth + (count - 1) * gap;
  const centred = index * (chipWidth + gap) + chipWidth / 2 - rowWidth / 2;
  return Math.max(0, Math.min(centred, content - rowWidth));
}
