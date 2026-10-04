/**
 * What the offline results say about each place (7i-2), from what's on the phone only: walking
 * minutes as a straight-line estimate from where you are (or the day's current stop), and "open,
 * as of Oct 11" from the synced hours and the last sync.
 */
import { knownHours, openAt } from '@cp/domain';

/** Walking pace for the straight-line estimate, metres a minute (about 4.5 km/h). */
const WALK_M_PER_MIN = 75;
const EARTH_M = 6_371_000;

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export function straightLineMetres(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whole walking minutes, at least one; null without both points. */
export function walkMinutes(from: LatLng | null, to: Partial<LatLng> | null): number | null {
  if (from === null || to === null || to.lat === undefined || to.lng === undefined) return null;
  const lat = to.lat;
  const lng = to.lng;
  return Math.max(1, Math.round(straightLineMetres(from, { lat, lng }) / WALK_M_PER_MIN));
}

/** Open now by the synced hours; null when they are unknown. */
export function openBySyncedHours(raw: string | undefined, tz: string, now: Date): boolean | null {
  if (raw === undefined) return null;
  try {
    const hours = knownHours(JSON.parse(raw));
    return hours === null ? null : openAt(hours, tz, now);
  } catch {
    return null;
  }
}
