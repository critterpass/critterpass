/**
 * Member status on the crew map ("Leaving Karsa Spa", "On the scooter · 2 km"): a deterministic
 * template from the activity, the nearest catalogue place within 80 m and the distance to the
 * meet-up. No model writes it. The result is a key plus variables; each app renders it in the
 * viewer's language.
 */
import type { LocationActivity } from '../location/wire';

export const STATUS_POI_RADIUS_M = 80;
export const ARRIVAL_RADIUS_M = 75;

export const MEMBER_STATUS_KEYS = [
  'arrived',
  'at_place',
  'leaving_place',
  'walking',
  'on_scooter',
  'cycling',
  'driving',
  'still',
  'unknown',
] as const;
export type MemberStatusKey = (typeof MEMBER_STATUS_KEYS)[number];

export interface MemberStatusInput {
  readonly activity: LocationActivity;
  /** Nearest catalogue place within 80 m, if any. */
  readonly poiName: string | null;
  /** Straight or routed distance to the meet-up, when one is set. */
  readonly meetupDistanceM: number | null;
  /** The trip's transport tag: `scooter` turns "driving" into "On the scooter". */
  readonly transport?: string | null;
}

export interface MemberStatus {
  readonly key: MemberStatusKey;
  readonly poi: string | null;
  readonly distanceM: number | null;
}

export function memberStatus(input: MemberStatusInput): MemberStatus {
  const distanceM = input.meetupDistanceM === null ? null : Math.round(input.meetupDistanceM);
  if (distanceM !== null && distanceM <= ARRIVAL_RADIUS_M) {
    return { key: 'arrived', poi: null, distanceM };
  }
  const poi = input.poiName;
  switch (input.activity) {
    case 'automotive':
      return {
        key: input.transport === 'scooter' ? 'on_scooter' : 'driving',
        poi: null,
        distanceM,
      };
    case 'cycling':
      return { key: 'cycling', poi: null, distanceM };
    case 'walking':
    case 'running':
      return poi === null
        ? { key: 'walking', poi: null, distanceM }
        : { key: 'leaving_place', poi, distanceM };
    case 'stationary':
      return poi === null
        ? { key: 'still', poi: null, distanceM }
        : { key: 'at_place', poi, distanceM };
    case 'unknown':
      return poi === null
        ? { key: 'unknown', poi: null, distanceM }
        : { key: 'at_place', poi, distanceM };
  }
}

/** "900 m", "2 km", "2.4 km": distances as the map shows them. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = meters / 1000;
  return km < 10
    ? `${(Math.round(km * 10) / 10).toString()} km`
    : `${Math.round(km).toString()} km`;
}

/** `member_etas.status_text`: the key, or `key:place` when a place is named. */
export function encodeMemberStatus(status: MemberStatus): string {
  return status.poi === null ? status.key : `${status.key}:${status.poi}`;
}

export function decodeMemberStatus(text: string | null, distanceM: number | null): MemberStatus {
  if (text === null) return { key: 'unknown', poi: null, distanceM };
  const split = text.indexOf(':');
  const key = split < 0 ? text : text.slice(0, split);
  const known = (MEMBER_STATUS_KEYS as readonly string[]).includes(key);
  return {
    key: known ? (key as MemberStatusKey) : 'unknown',
    poi: split < 0 ? null : text.slice(split + 1),
    distanceM,
  };
}
