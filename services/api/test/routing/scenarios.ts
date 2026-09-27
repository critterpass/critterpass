/**
 * Real Kyoto requests shared by the fixture recorder and the tests, so a replayed test sends exactly
 * the requests that were recorded.
 */
import type { RouteEtaInput } from '@cp/domain';

import type {
  ClosureRing,
  LatLngPoint,
  LeaveByInput,
  MatrixInput,
} from '../../src/routing/provider';

export const KYOTO_STATION: LatLngPoint = { lat: 34.9858, lng: 135.7588 };
export const KIYOMIZU_DERA: LatLngPoint = { lat: 34.9949, lng: 135.785 };
const NISHIKI_MARKET: LatLngPoint = { lat: 35.005, lng: 135.7649 };
const KINKAKU_JI: LatLngPoint = { lat: 35.0394, lng: 135.7292 };
const FUSHIMI_INARI: LatLngPoint = { lat: 34.9671, lng: 135.7727 };
const ARASHIYAMA: LatLngPoint = { lat: 35.017, lng: 135.6717 };

/** Recording time is pinned so `depart_at` values stay identical between record and replay. */
export const RECORDED_NOW = new Date('2026-09-27T12:00:00Z');
/** 09:00 Thursday in Kyoto (JST): morning traffic. */
export const KYOTO_WEEKDAY_MORNING = new Date('2026-10-01T00:00:00Z');

const stationToKiyomizu = {
  originLat: KYOTO_STATION.lat,
  originLng: KYOTO_STATION.lng,
  destLat: KIYOMIZU_DERA.lat,
  destLng: KIYOMIZU_DERA.lng,
};

/** Shichijo-dori across the Kamo river: the direct drive from the station to Kiyomizu uses it. */
export const SHICHIJO_BRIDGE_CLOSURE: ClosureRing = [
  [135.764, 34.988],
  [135.772, 34.988],
  [135.772, 34.9905],
  [135.764, 34.9905],
  [135.764, 34.988],
];

export const ETA_SCENARIOS = {
  'kyoto-walk': { ...stationToKiyomizu, mode: 'pedestrian' },
  'kyoto-drive': { ...stationToKiyomizu, mode: 'auto' },
  'kyoto-drive-depart-at': { ...stationToKiyomizu, mode: 'auto', departAt: KYOTO_WEEKDAY_MORNING },
  'kyoto-drive-closure': {
    ...stationToKiyomizu,
    mode: 'auto',
    closures: [SHICHIJO_BRIDGE_CLOSURE],
  },
  'kyoto-scooter': { ...stationToKiyomizu, mode: 'motor_scooter' },
} as const satisfies Record<string, RouteEtaInput>;

/** A 5 x 4 lattice over central Kyoto: 20 points, 40 coordinates as a square matrix. */
export const KYOTO_LATTICE: readonly LatLngPoint[] = Array.from({ length: 20 }, (_, index) => ({
  lat: 34.99 + Math.floor(index / 5) * 0.008,
  lng: 135.75 + (index % 5) * 0.008,
}));

export const MATRIX_SCENARIOS = {
  'kyoto-matrix-drive': {
    origins: [KYOTO_STATION, NISHIKI_MARKET, KINKAKU_JI],
    destinations: [KIYOMIZU_DERA, FUSHIMI_INARI, ARASHIYAMA],
    mode: 'auto',
  },
  'kyoto-matrix-walk-chunked': {
    origins: KYOTO_LATTICE,
    destinations: KYOTO_LATTICE,
    mode: 'pedestrian',
  },
} as const satisfies Record<string, MatrixInput>;

export const LEAVE_BY_SCENARIOS = {
  'kyoto-leave-by-drive': {
    origin: KYOTO_STATION,
    dest: KIYOMIZU_DERA,
    mode: 'auto',
    arriveBy: new Date('2026-10-01T00:30:00Z'),
  },
} as const satisfies Record<string, LeaveByInput>;
