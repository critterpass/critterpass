/**
 * The box a destination covers, read from its synced `geofence` (a PostGIS geography, which
 * reaches the phone as hex EWKB; WKT and GeoJSON text are read too). "Arrived" means the phone's
 * position is inside this box: in the destination itself, not merely in its country, so a
 * traveller on a trip in their own country doesn't arrive before leaving home.
 */
/* eslint-disable lingui/no-unlocalized-strings -- geometry formats, never copy. */

export interface Box {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

function boxOfPoints(points: readonly (readonly [number, number])[]): Box | null {
  const ok = points.filter(
    ([lng, lat]) =>
      Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90,
  );
  if (ok.length < 3) return null;
  return {
    west: Math.min(...ok.map((p) => p[0])),
    east: Math.max(...ok.map((p) => p[0])),
    south: Math.min(...ok.map((p) => p[1])),
    north: Math.max(...ok.map((p) => p[1])),
  };
}

const EWKB_Z = 0x80000000;
const EWKB_M = 0x40000000;
const EWKB_SRID = 0x20000000;

/** Every vertex of a (Multi)Polygon in EWKB. */
function ewkbPoints(hex: string): [number, number][] | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/iu.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1)
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const view = new DataView(bytes.buffer);
  let at = 0;
  const points: [number, number][] = [];
  const geometry = (): boolean => {
    if (at + 5 > view.byteLength) return false;
    const little = view.getUint8(at) === 1;
    const type = view.getUint32(at + 1, little);
    at += 5;
    if ((type & EWKB_SRID) !== 0) at += 4;
    const dims = 2 + ((type & EWKB_Z) !== 0 ? 1 : 0) + ((type & EWKB_M) !== 0 ? 1 : 0);
    const kind = type & 0xff;
    if (at + 4 > view.byteLength) return false;
    const count = view.getUint32(at, little);
    at += 4;
    if (kind === 6) {
      for (let i = 0; i < count; i += 1) if (!geometry()) return false;
      return true;
    }
    if (kind !== 3) return false;
    for (let ring = 0; ring < count; ring += 1) {
      if (at + 4 > view.byteLength) return false;
      const n = view.getUint32(at, little);
      at += 4;
      if (at + n * dims * 8 > view.byteLength) return false;
      for (let i = 0; i < n; i += 1) {
        points.push([view.getFloat64(at, little), view.getFloat64(at + 8, little)]);
        at += dims * 8;
      }
    }
    return true;
  };
  return geometry() ? points : null;
}

/** Number pairs of a WKT or GeoJSON polygon, in lng lat order. */
function textPoints(text: string): [number, number][] {
  const numbers = (
    text.replace(/SRID=\d+;/iu, '').match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/giu) ?? []
  ).map(Number);
  const points: [number, number][] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push([numbers[i] ?? Number.NaN, numbers[i + 1] ?? Number.NaN]);
  }
  return points;
}

export function boxOf(geofence: string | null | undefined): Box | null {
  if (geofence === null || geofence === undefined) return null;
  const value = geofence.trim();
  if (value === '') return null;
  const points = /^[0-9a-f]+$/iu.test(value) ? ewkbPoints(value) : textPoints(value);
  return points === null ? null : boxOfPoints(points);
}

export function inBox(box: Box, lat: number, lng: number): boolean {
  return lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east;
}
