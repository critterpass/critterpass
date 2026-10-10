/**
 * The plan map's sheet (4.25–4.27): three heights measured on the 844 pt frame and kept as
 * distances, so they read the same on every phone. Peek shows 296 pt of sheet (the day chips and
 * the day's head), half 544 pt (the day's timeline), and full leaves a 146 pt strip of map under
 * the status bar (the whole trip over the island). The camera fits what matters into the map that
 * stays visible above the sheet and below the top chrome.
 */
export type MapDetent = 'peek' | 'half' | 'full';

export const PEEK_VISIBLE = 296;
export const HALF_VISIBLE = 544;
/** Distance from the screen's top to the full sheet's top edge (the island strip above it). */
export const FULL_TOP = 196;
/** The search pill and filter chips at peek, the search pill alone at half. */
export const CHROME_BOTTOM: Readonly<Record<MapDetent, number>> = {
  peek: 150,
  half: 110,
  full: 50,
};

/** The sheet's visible height at a detent on a screen `height` tall. */
export function sheetHeight(detent: MapDetent, height: number): number {
  switch (detent) {
    case 'peek':
      return Math.min(PEEK_VISIBLE, height);
    case 'half':
      // On a short phone half stays clear of full by a grab's height.
      return Math.min(HALF_VISIBLE, Math.max(PEEK_VISIBLE + 40, height - FULL_TOP - 40));
    case 'full':
      return Math.max(0, height - FULL_TOP);
  }
}

export interface CameraPadding {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** Padding that fits bounds between the top chrome and the sheet, with a margin all round. */
export function cameraPadding(detent: MapDetent, height: number, margin = 24): CameraPadding {
  return {
    top: CHROME_BOTTOM[detent] + margin,
    bottom: sheetHeight(detent, height) + margin,
    left: margin,
    right: margin,
  };
}

/** The nearest detent to a sheet released at `visible` pt, moving with `velocity` (pt/s, up +). */
export function settleDetent(visible: number, velocity: number, height: number): MapDetent {
  const order: MapDetent[] = ['peek', 'half', 'full'];
  const heights = order.map((detent) => sheetHeight(detent, height));
  const FLING = 800;
  if (Math.abs(velocity) > FLING) {
    const index = heights.findIndex((h) => h > visible);
    if (velocity > 0) return order[index === -1 ? 2 : index] ?? 'full';
    const below = heights.filter((h) => h < visible).length - 1;
    return order[Math.max(0, below)] ?? 'peek';
  }
  let best: MapDetent = 'peek';
  let distance = Infinity;
  heights.forEach((h, i) => {
    if (Math.abs(h - visible) < distance) {
      distance = Math.abs(h - visible);
      best = order[i] ?? best;
    }
  });
  return best;
}
