/**
 * Where a "befriend" quest can be done: the nearest spot of the trip's spawn rules (the synced
 * trip pack the encounter engine reads) that can give a critter on its own, measured from the
 * phone's last known position. With no position yet it is the first such spot, without a
 * distance. Timed (window) and crew-together (co-presence) rules are left out: a traveller sent
 * there could wait for nothing.
 */
/* eslint-disable lingui/no-unlocalized-strings -- rule kinds, never copy. */
import { distanceM, type LatLng } from '@cp/domain';
import { Platform } from 'react-native';

import { chosenMapsApp, mapsAppFor, mapsDirectionsUrl, WALK_FIRST_MAX_M } from '@/features/go';

import { spotsFor, type SpawnPoiRow, type SpawnSqlRow } from '../data/spawn-rows';

export interface BefriendSpot {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** Metres from the phone, or null without a position. */
  readonly distanceM: number | null;
}

const SOLO_KINDS: ReadonlySet<string> = new Set(['presence', 'any_of', 'set_count']);

export function nearestBefriendSpot(input: {
  readonly rules: readonly SpawnSqlRow[];
  readonly pois: ReadonlyMap<string, SpawnPoiRow>;
  readonly destinationId: string | null;
  /** The quest's set, when it names one; null = any of the trip's critters. */
  readonly setId: string | null;
  readonly position: LatLng | null;
}): BefriendSpot | null {
  if (input.destinationId === null) return null;
  let best: BefriendSpot | null = null;
  for (const rule of input.rules) {
    if (rule.destination_id !== input.destinationId || !SOLO_KINDS.has(rule.kind)) continue;
    if (input.setId !== null && rule.set_id !== input.setId) continue;
    for (const spot of spotsFor(rule, input.pois)) {
      if (spot.name === '') continue;
      const away = input.position === null ? null : distanceM(input.position, spot);
      const candidate = { name: spot.name, lat: spot.lat, lng: spot.lng, distanceM: away };
      if (best === null) best = candidate;
      else if (away !== null && (best.distanceM === null || away < best.distanceM)) {
        best = candidate;
      }
    }
  }
  return best;
}

/**
 * Directions to the spot in the phone's maps app (the one GO hands off to): walking when it is
 * close, driving otherwise.
 */
export function directionsUrl(
  spot: BefriendSpot,
  platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android',
): string {
  const walking = spot.distanceM === null || spot.distanceM <= WALK_FIRST_MAX_M;
  return mapsDirectionsUrl(spot, walking ? 'walk' : 'drive', mapsAppFor(platform, chosenMapsApp()));
}

/**
 * The reader's distance unit as the formatter takes it, from `user_settings.distance_unit`, which
 * stores 'km' or 'mi' (unset reads as kilometres).
 */
export function distanceUnitOf(setting: string | null | undefined): 'metric' | 'imperial' {
  return setting === 'mi' ? 'imperial' : 'metric';
}
