/**
 * Where an off-screen stop's pill sits on the map's edge ("1 ← JATILUWIH", 7a-1, 7b-1): on the
 * side the stop lies beyond, level with it along that edge, kept clear of the corners.
 */
export type EdgeSide = 'left' | 'right' | 'top' | 'bottom';

export interface EdgePlacement {
  readonly side: EdgeSide;
  /** Distance along the edge in points: from the top for left/right, from the left otherwise. */
  readonly along: number;
}

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

/** Web Mercator y for a latitude, in radians of the projection. */
function mercatorY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  return Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
}

/** A point in view coordinates for the visible `bounds` ([west, south, east, north]). */
export function projectInView(
  lng: number,
  lat: number,
  bounds: readonly [number, number, number, number],
  size: ViewSize,
): { readonly x: number; readonly y: number } {
  const [west, south, east, north] = bounds;
  const spanX = east - west || 1;
  const top = mercatorY(north);
  const spanY = top - mercatorY(south) || 1;
  return {
    x: ((lng - west) / spanX) * size.width,
    y: ((top - mercatorY(lat)) / spanY) * size.height,
  };
}

/**
 * The pill's place for a stop, or null while the stop is on screen. `margin` keeps the pill off the
 * corners (and off a sheet or header covering the map's foot or head).
 */
export function edgePlacement(
  lng: number,
  lat: number,
  bounds: readonly [number, number, number, number],
  size: ViewSize,
  margin: { readonly top: number; readonly bottom: number; readonly side: number },
): EdgePlacement | null {
  const { x, y } = projectInView(lng, lat, bounds, size);
  const visibleBottom = size.height - margin.bottom;
  const inside = x >= 0 && x <= size.width && y >= margin.top && y <= visibleBottom;
  if (inside) return null;
  const clampY = Math.max(margin.top, Math.min(visibleBottom, y));
  const clampX = Math.max(margin.side, Math.min(size.width - margin.side, x));
  if (x < 0) return { side: 'left', along: clampY };
  if (x > size.width) return { side: 'right', along: clampY };
  if (y < margin.top) return { side: 'top', along: clampX };
  return { side: 'bottom', along: clampX };
}

/**
 * Pills on the same edge pushed apart so none overlaps the one before it (two stops beyond the same
 * corner), keeping their order along the edge.
 */
export function spreadAlongEdges<T extends { readonly placement: EdgePlacement }>(
  pills: readonly T[],
  gapFor: (side: EdgeSide) => number,
): T[] {
  const sides = new Map<EdgeSide, T[]>();
  for (const pill of pills) {
    const side = sides.get(pill.placement.side) ?? [];
    side.push(pill);
    sides.set(pill.placement.side, side);
  }
  const spread: T[] = [];
  for (const [edge, side] of sides) {
    const gap = gapFor(edge);
    let last = Number.NEGATIVE_INFINITY;
    for (const pill of [...side].sort((a, b) => a.placement.along - b.placement.along)) {
      const along = Math.max(pill.placement.along, last + gap);
      last = along;
      spread.push({ ...pill, placement: { ...pill.placement, along } });
    }
  }
  return spread;
}
