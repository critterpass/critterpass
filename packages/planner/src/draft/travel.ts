/**
 * The draft's travel matrix between places: the quicker of walking and transit, each the routing
 * fallback's straight-line estimate (distance x detour at a per-mode speed plus a buffer), so the
 * scheduler, the validator and the redraft's "less travel" number all read the same minutes.
 * Past a city's reach (a day trip) the leg is a road or rail ride at regional speed instead.
 */
import { estimateStraightLineEta } from '@cp/domain';

import type { DraftPoi, TravelMatrix } from './types';

/** Routed distance past which a leg is a regional ride (coach, car or train), not city transit. */
const REGIONAL_FROM_M = 25_000;
const REGIONAL_KMH = 60;
const REGIONAL_BUFFER_MIN = 10;

export function straightLineMatrix(pois: ReadonlyMap<string, DraftPoi>): TravelMatrix {
  // Asked for millions of times while a draft is sequenced: one map per place, both directions
  // stored, so a known leg costs two lookups and no string building.
  const cache = new Map<string, Map<string, number>>();
  const row = (id: string) => {
    let found = cache.get(id);
    if (found === undefined) {
      found = new Map();
      cache.set(id, found);
    }
    return found;
  };
  return (from, to) => {
    if (from === to) return 0;
    const known = cache.get(from)?.get(to);
    if (known !== undefined) return known;
    const a = pois.get(from);
    const b = pois.get(to);
    if (a === undefined || b === undefined) return null;
    const leg = { originLat: a.lat, originLng: a.lng, destLat: b.lat, destLng: b.lng };
    const transit = estimateStraightLineEta({ ...leg, mode: 'multimodal' });
    const minutes =
      transit.distanceM > REGIONAL_FROM_M
        ? Math.round((transit.distanceM / 1000 / REGIONAL_KMH) * 60) + REGIONAL_BUFFER_MIN
        : Math.min(
            estimateStraightLineEta({ ...leg, mode: 'pedestrian' }).minutes,
            transit.minutes,
          );
    row(from).set(to, minutes);
    row(to).set(from, minutes);
    return minutes;
  };
}
