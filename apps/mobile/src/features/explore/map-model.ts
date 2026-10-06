/**
 * Explore's place geometry and text, apart from any rendering: the places' shape, folding names for
 * a search, the distance between two points and the middle of a set of places.
 */
export interface MapPoi {
  readonly id: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  /** The stored opening hours (parsed JSON), or null. */
  readonly hours: unknown;
  /** One of the guide's must-sees. */
  readonly mustSee: boolean;
  /** The editors wrote it up (a reason to go), must-see or not. */
  readonly written: boolean;
  /** The editors' best-time line ("Light beams 09–10"), shown as written. */
  readonly bestTime?: string | null | undefined;
}

/** Lower-cased with the marks folded away, so "da nang" finds "Đà Nẵng". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/gu, '').replace(/[đĐ]/gu, 'd').toLowerCase();
}

export interface Point {
  readonly lat: number;
  readonly lng: number;
}

const EARTH_M = 6_371_000;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle metres between two points. */
export function distanceMeters(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The middle of the places, where the map opens. */
export function centreOf(places: readonly Point[]): Point | null {
  if (places.length === 0) return null;
  const sum = places.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), {
    lat: 0,
    lng: 0,
  });
  return { lat: sum.lat / places.length, lng: sum.lng / places.length };
}
