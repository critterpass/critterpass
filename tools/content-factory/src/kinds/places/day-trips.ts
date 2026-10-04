/**
 * How far out a destination's day trips reach: an editorial place beyond the imported area is
 * only useful where the app can route to it and draw it, so it has to lie inside the
 * destination's routing box as built (its stored box widened by the build buffer) and inside its
 * map pack. A destination with either on record nowhere is not limited.
 */
import { GUEST_PLACE_EXTRACTS, GUIDE_DESTINATION_EXTRACTS } from '../../../../maps/destinations';
import { bufferBbox, readBoxes } from '../../../../routing-tiles/src/boxes';
import { distanceM } from '../media/place-match';
import type { Box } from './landmarks';

export function dayTripReach(slug: string): Box | null {
  const routing = readBoxes().boxes.find((box) => box.slug === slug);
  const pack = [...GUIDE_DESTINATION_EXTRACTS, ...GUEST_PLACE_EXTRACTS].find(
    (extract) => extract.slug === slug,
  );
  if (routing === undefined || pack === undefined) return null;
  const [west, south, east, north] = bufferBbox(routing.bbox);
  const [packWest = west, packSouth = south, packEast = east, packNorth = north] = pack.bounds
    .split(',')
    .map(Number);
  return {
    south: Math.max(south, packSouth),
    west: Math.max(west, packWest),
    north: Math.min(north, packNorth),
    east: Math.min(east, packEast),
  };
}

/** How far `point` lies outside `box`, in whole kilometres (0 inside). */
export function kmOutside(box: Box, point: { readonly lat: number; readonly lng: number }): number {
  const nearest = {
    lat: Math.min(box.north, Math.max(box.south, point.lat)),
    lng: Math.min(box.east, Math.max(box.west, point.lng)),
  };
  return Math.ceil(distanceM(point, nearest) / 1000);
}
