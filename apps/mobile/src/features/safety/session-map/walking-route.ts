/**
 * Walking to the person who needs help. The app holds no routed path (the routing layer answers
 * minutes and metres, not a line), so the map draws the straight line between the two positions,
 * says it is one, and hands turn-by-turn walking directions to the phone's own maps app.
 */
/* eslint-disable lingui/no-unlocalized-strings -- URLs and wire values, never copy. */
import { distanceM } from '@cp/domain';

export interface Point {
  readonly lat: number;
  readonly lng: number;
}

/** `[lng, lat]` pairs for the map's line layer; null until both ends are known. */
export function straightLine(
  from: Point | null,
  to: Point | null,
): readonly (readonly [number, number])[] | null {
  if (from === null || to === null) return null;
  return [
    [from.lng, from.lat],
    [to.lng, to.lat],
  ];
}

/** The point halfway, and a zoom that keeps both ends on a phone screen. */
export function frame(from: Point | null, to: Point): { centre: Point; zoom: number } {
  if (from === null) return { centre: to, zoom: 15 };
  const metres = distanceM(from, to);
  const zoom =
    metres < 300 ? 16 : metres < 1200 ? 15 : metres < 5000 ? 13 : metres < 20_000 ? 11 : 9;
  return { centre: { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 }, zoom };
}

/** Walking directions to `to` in the phone's maps app (Apple Maps on iOS, Google Maps elsewhere). */
export function walkingDirectionsUrl(to: Point, platform: 'ios' | 'android'): string {
  const at = `${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
  return platform === 'ios'
    ? `https://maps.apple.com/?daddr=${at}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${at}&travelmode=walking`;
}
