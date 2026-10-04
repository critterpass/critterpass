/**
 * Encoded polylines (the Google / Valhalla format) and a Douglas–Peucker simplify, for the road
 * shape a stored plan leg keeps. Points are `[lng, lat]` (GeoJSON order, as the maps draw them);
 * the encoding itself writes latitude first, as the format says. Valhalla answers at precision 6;
 * a stored leg shape is written at `PLAN_LEG_SHAPE_PRECISION` (5, about a metre), which is plenty
 * once the shape is simplified for display.
 */
export type LngLat = readonly [lng: number, lat: number];

export const PLAN_LEG_SHAPE_PRECISION = 5;
/** Simplify tolerance a stored leg starts from, in metres. */
export const PLAN_LEG_SHAPE_TOLERANCE_M = 5;
/** Most points a stored leg shape keeps; the tolerance grows until the shape fits. */
export const PLAN_LEG_SHAPE_MAX_POINTS = 200;

function encodeValue(value: number): string {
  let rest = value < 0 ? ~(value << 1) : value << 1;
  let out = '';
  while (rest >= 0x20) {
    out += String.fromCharCode((0x20 | (rest & 0x1f)) + 63);
    rest >>>= 5;
  }
  return out + String.fromCharCode(rest + 63);
}

export function encodePolyline(points: readonly LngLat[], precision: number): string {
  const factor = 10 ** precision;
  let lastLat = 0;
  let lastLng = 0;
  let out = '';
  for (const [lng, lat] of points) {
    const latE = Math.round(lat * factor);
    const lngE = Math.round(lng * factor);
    out += encodeValue(latE - lastLat) + encodeValue(lngE - lastLng);
    lastLat = latE;
    lastLng = lngE;
  }
  return out;
}

/** Decodes an encoded polyline; a truncated or malformed string yields the points read so far. */
export function decodePolyline(encoded: string, precision: number): LngLat[] {
  const factor = 10 ** precision;
  const points: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (index >= encoded.length) return null;
      const byte = encoded.charCodeAt(index) - 63;
      index += 1;
      if (byte < 0 || byte > 0x3f) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) break;
      if (shift > 30) return null;
    }
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) break;
    lat += dLat;
    lng += dLng;
    points.push([lng / factor, lat / factor]);
  }
  return points;
}

const METERS_PER_DEGREE = 111_320;

/** Squared distance in metres from `p` to the segment `a`–`b`, on a local flat projection. */
function segmentDistanceSq(p: LngLat, a: LngLat, b: LngLat, lngScale: number): number {
  const ax = a[0] * lngScale;
  const ay = a[1] * METERS_PER_DEGREE;
  const dx = b[0] * lngScale - ax;
  const dy = b[1] * METERS_PER_DEGREE - ay;
  const px = p[0] * lngScale - ax;
  const py = p[1] * METERS_PER_DEGREE - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSq));
  const ex = px - t * dx;
  const ey = py - t * dy;
  return ex * ex + ey * ey;
}

function douglasPeucker(points: readonly LngLat[], toleranceM: number, lngScale: number) {
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const toleranceSq = toleranceM * toleranceM;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    const a = points[first] as LngLat;
    const b = points[last] as LngLat;
    let farthest = -1;
    let farthestSq = toleranceSq;
    for (let i = first + 1; i < last; i += 1) {
      const distanceSq = segmentDistanceSq(points[i] as LngLat, a, b, lngScale);
      if (distanceSq > farthestSq) {
        farthest = i;
        farthestSq = distanceSq;
      }
    }
    if (farthest === -1) continue;
    keep[farthest] = 1;
    stack.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, i) => keep[i] === 1);
}

/**
 * Douglas–Peucker at `toleranceM`, doubling the tolerance until at most `maxPoints` remain (at
 * least two: the ends always stay). Repeated consecutive points are dropped first.
 */
export function simplifyPath(
  points: readonly LngLat[],
  options: { readonly toleranceM: number; readonly maxPoints: number },
): LngLat[] {
  const distinct = points.filter(
    (point, i) => i === 0 || point[0] !== points[i - 1]?.[0] || point[1] !== points[i - 1]?.[1],
  );
  if (distinct.length <= 2) return distinct;
  const midLat = (distinct[Math.floor(distinct.length / 2)] as LngLat)[1];
  const lngScale = METERS_PER_DEGREE * Math.cos((midLat * Math.PI) / 180);
  const budget = Math.max(2, options.maxPoints);
  let tolerance = Math.max(options.toleranceM, 0.01);
  let simplified = douglasPeucker(distinct, tolerance, lngScale);
  while (simplified.length > budget) {
    tolerance *= 2;
    simplified = douglasPeucker(distinct, tolerance, lngScale);
  }
  return simplified;
}
