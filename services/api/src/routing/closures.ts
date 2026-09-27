/**
 * Mapbox Directions cannot avoid polygons, only up to 50 `exclude=point(lng lat)` locations, and
 * only on the driving profiles (./README.md "Closures"). This turns closure rings into that budget
 * of points: every ring's vertices plus an interior grid, thinned evenly when over the limit. A road
 * that crosses a closure between two sampled points can still be used; callers that need a hard
 * guarantee check the returned geometry with `routeCrossesClosures`.
 */
import type { LngLat } from './mapbox';
import type { ClosureRing } from './provider';

/** Mapbox's per-request cap on `exclude` points. */
export const MAX_EXCLUDE_POINTS = 50;
/** Interior grid resolution per ring (a 5x5 lattice over the ring's bounding box). */
const GRID_STEPS = 5;

/** Ray-casting point-in-polygon on `[lng, lat]` positions; fine at city scale. */
export function pointInRing(point: LngLat, ring: ClosureRing): boolean {
  let inside = false;
  ring.forEach(([xi, yi], i) => {
    const [xj, yj] = ring[(i + ring.length - 1) % ring.length] ?? [xi, yi];
    const crosses =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  });
  return inside;
}

function ringVertices(ring: ClosureRing): LngLat[] {
  const first = ring[0];
  const last = ring.at(-1);
  const closed =
    ring.length > 1 &&
    first !== undefined &&
    last !== undefined &&
    first[0] === last[0] &&
    first[1] === last[1];
  return (closed ? ring.slice(0, -1) : ring).map(([lng, lat]) => ({ lng, lat }));
}

function interiorGrid(ring: ClosureRing): LngLat[] {
  const lngs = ring.map(([lng]) => lng);
  const lats = ring.map(([, lat]) => lat);
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const points: LngLat[] = [];
  for (let i = 0; i <= GRID_STEPS; i++) {
    for (let j = 0; j <= GRID_STEPS; j++) {
      const point = {
        lng: minLng + ((maxLng - minLng) * i) / GRID_STEPS,
        lat: minLat + ((maxLat - minLat) * j) / GRID_STEPS,
      };
      if (pointInRing(point, ring)) points.push(point);
    }
  }
  return points;
}

/** Evenly thins `points` down to `limit`, keeping the first of each equal-width stretch. */
function thin<T>(points: readonly T[], limit: number): T[] {
  if (points.length <= limit) return [...points];
  const step = points.length / limit;
  return points.filter((_, index) => Math.floor(index / step) !== Math.floor((index - 1) / step));
}

/** Exclude points for `closures`, at most `MAX_EXCLUDE_POINTS` in total, shared across rings. */
export function closureExcludePoints(closures: readonly ClosureRing[]): LngLat[] {
  const valid = closures.filter((ring) => ring.length >= 3);
  if (valid.length === 0) return [];
  const perRing = Math.max(1, Math.floor(MAX_EXCLUDE_POINTS / valid.length));
  const points = valid.flatMap((ring) =>
    thin([...ringVertices(ring), ...interiorGrid(ring)], perRing),
  );
  return points.slice(0, MAX_EXCLUDE_POINTS);
}

/** True when any vertex of the route geometry falls inside a closure. */
export function routeCrossesClosures(
  geometry: readonly (readonly [number, number])[],
  closures: readonly ClosureRing[],
): boolean {
  return geometry.some(([lng, lat]) => closures.some((ring) => pointInRing({ lng, lat }, ring)));
}
