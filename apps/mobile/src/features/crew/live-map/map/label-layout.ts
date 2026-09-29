/**
 * Where the camera frames the crew and how pin labels avoid each other. The camera fits every pin,
 * the meet-up and you inside the strip between the header and the panel; this projects the same
 * fit (Web Mercator) to screen points, then lifts any label that would draw over one placed before
 * it, so names and status lines never overlap. Pins that are genuinely together are already one
 * bunch pill (60 m).
 */

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly padding: { top: number; bottom: number; left: number; right: number };
}

export interface LabelBox {
  readonly key: string;
  readonly lng: number;
  readonly lat: number;
  /** The label's extent around its anchor point, in points: left, top, right (bottom = anchor). */
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

/** Deepest zoom the fit may reach (a street-level view of a tight cluster). */
export const MAX_FIT_ZOOM = 16;
const TILE = 512;
const GAP = 4;

function mercator(lng: number, lat: number): [number, number] {
  const phi = (lat * Math.PI) / 180;
  return [(lng + 180) / 360, (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2];
}

/** Screen point of each position once the camera has fitted them all into the viewport. */
export function fitProjection(
  points: readonly (readonly [number, number])[],
  view: Viewport,
): (lng: number, lat: number) => [number, number] {
  const projected = points.map(([lng, lat]) => mercator(lng, lat));
  const xs = projected.map((p) => p[0]);
  const ys = projected.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const w = Math.max(1, view.width - view.padding.left - view.padding.right);
  const h = Math.max(1, view.height - view.padding.top - view.padding.bottom);
  const maxScale = TILE * 2 ** MAX_FIT_ZOOM;
  const scale = Math.min(maxScale, w / Math.max(x1 - x0, 1e-12), h / Math.max(y1 - y0, 1e-12));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const ox = view.padding.left + w / 2;
  const oy = view.padding.top + h / 2;
  return (lng, lat) => {
    const [x, y] = mercator(lng, lat);
    return [ox + (x - cx) * scale, oy + (y - cy) * scale];
  };
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Offsets (points) per label so no two overlap, placing them in order (the first never moves):
 * up by default, down below the clash when going up would pass `minY`. Returns `[dx, dy]` for the annotation's `offset`.
 */
export function declutter(
  boxes: readonly LabelBox[],
  project: (lng: number, lat: number) => [number, number],
  /** Labels never lift above this line (the header); they drop below the clash instead. */
  minY = -Infinity,
): Map<string, [number, number]> {
  const placed: Rect[] = [];
  const offsets = new Map<string, [number, number]>();
  for (const box of boxes) {
    const [px, py] = project(box.lng, box.lat);
    const rect: Rect = {
      x0: px + box.left,
      y0: py - box.height,
      x1: px + box.left + box.width,
      y1: py,
    };
    let lift = 0;
    let downward = false;
    for (let guard = 0; guard < 12; guard++) {
      const hit = placed.find((other) =>
        overlaps({ ...rect, y0: rect.y0 - lift, y1: rect.y1 - lift }, other),
      );
      if (hit === undefined) break;
      const up = rect.y1 - hit.y0 + GAP;
      if (!downward && rect.y0 - up >= minY) {
        lift = up;
      } else {
        // No room above: sit just below the label it clashed with.
        downward = true;
        lift = rect.y0 - hit.y1 - GAP;
      }
    }
    placed.push({ ...rect, y0: rect.y0 - lift, y1: rect.y1 - lift });
    offsets.set(box.key, [0, lift === 0 ? 0 : -lift]);
  }
  return offsets;
}
