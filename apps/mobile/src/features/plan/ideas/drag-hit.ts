/**
 * Which day chip a dragged idea is over (7f-2 DROP ON A DAY): the chip row's frame on screen when
 * the row was lifted, how many chips it holds and how they are laid out (sharing the width, or a
 * fixed width when the row scrolls, with how far it is scrolled), and the finger. A finger in the
 * gap between two chips counts for the nearer one; a little slop above and below the row still
 * counts, so a drop that lands on a chip's edge is not lost. Runs on the UI thread too.
 */
export interface ChipRowFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ChipLayout {
  readonly count: number;
  readonly gap: number;
  /** Fixed chip width when the row scrolls; null when the chips share the row's width. */
  readonly slotWidth: number | null;
  /** How far the row is scrolled sideways. */
  readonly scrollX: number;
}

/** Points above and below the row that still count as over it. */
export const DROP_SLOP = 16;

/** The index of the chip under (x, y), or -1 when the finger is not over the row. */
export function dragHit(frame: ChipRowFrame, layout: ChipLayout, x: number, y: number): number {
  'worklet';
  if (layout.count <= 0 || frame.width <= 0) return -1;
  if (y < frame.y - DROP_SLOP || y > frame.y + frame.height + DROP_SLOP) return -1;
  if (x < frame.x || x > frame.x + frame.width) return -1;
  const slot = layout.slotWidth ?? (frame.width - layout.gap * (layout.count - 1)) / layout.count;
  const pitch = slot + layout.gap;
  const along = x - frame.x + layout.scrollX;
  const index = Math.floor((along + layout.gap / 2) / pitch);
  if (index < 0) return 0;
  return index >= layout.count ? layout.count - 1 : index;
}
