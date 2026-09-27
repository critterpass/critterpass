/**
 * City bounding boxes the bench samples random walk/drive pairs and matrix points from.
 * `sea-japan` is the phase's required extract (Vietnam, Thailand, Malaysia, Singapore, Indonesia,
 * Philippines, Cambodia, Laos, Japan); `guide` covers the four guide destinations outside that
 * extract (Iceland, Portugal, Peru, Mexico) added to the same tile build.
 */

export type CityGroup = 'sea-japan' | 'guide';

export interface CityBbox {
  readonly key: string;
  readonly label: string;
  readonly country: string;
  readonly group: CityGroup;
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

export const CITIES: readonly CityBbox[] = [
  {
    key: 'da-nang',
    label: 'Da Nang',
    country: 'Vietnam',
    group: 'sea-japan',
    south: 15.98,
    west: 108.18,
    north: 16.08,
    east: 108.26,
  },
  {
    key: 'hanoi',
    label: 'Hanoi',
    country: 'Vietnam',
    group: 'sea-japan',
    south: 20.97,
    west: 105.78,
    north: 21.06,
    east: 105.88,
  },
  {
    key: 'ho-chi-minh-city',
    label: 'Ho Chi Minh City',
    country: 'Vietnam',
    group: 'sea-japan',
    south: 10.72,
    west: 106.62,
    north: 10.84,
    east: 106.72,
  },
  {
    key: 'bangkok',
    label: 'Bangkok',
    country: 'Thailand',
    group: 'sea-japan',
    south: 13.69,
    west: 100.45,
    north: 13.82,
    east: 100.6,
  },
  {
    key: 'kuala-lumpur',
    label: 'Kuala Lumpur',
    country: 'Malaysia',
    group: 'sea-japan',
    south: 3.09,
    west: 101.63,
    north: 3.19,
    east: 101.73,
  },
  {
    key: 'singapore',
    label: 'Singapore',
    country: 'Singapore',
    group: 'sea-japan',
    south: 1.26,
    west: 103.7,
    north: 1.4,
    east: 103.9,
  },
  {
    key: 'bali',
    label: 'Bali (Denpasar–Ubud–Kuta)',
    country: 'Indonesia',
    group: 'sea-japan',
    south: -8.72,
    west: 115.08,
    north: -8.55,
    east: 115.27,
  },
  {
    key: 'manila',
    label: 'Manila',
    country: 'Philippines',
    group: 'sea-japan',
    south: 14.53,
    west: 120.95,
    north: 14.65,
    east: 121.05,
  },
  {
    key: 'siem-reap',
    label: 'Siem Reap',
    country: 'Cambodia',
    group: 'sea-japan',
    south: 13.33,
    west: 103.82,
    north: 13.4,
    east: 103.91,
  },
  {
    key: 'luang-prabang',
    label: 'Luang Prabang',
    country: 'Laos',
    group: 'sea-japan',
    south: 19.87,
    west: 102.11,
    north: 19.91,
    east: 102.17,
  },
  {
    key: 'tokyo',
    label: 'Tokyo',
    country: 'Japan',
    group: 'sea-japan',
    south: 35.63,
    west: 139.65,
    north: 35.75,
    east: 139.82,
  },
  {
    key: 'osaka',
    label: 'Osaka',
    country: 'Japan',
    group: 'sea-japan',
    south: 34.63,
    west: 135.44,
    north: 34.72,
    east: 135.55,
  },
  {
    key: 'reykjavik',
    label: 'Reykjavík',
    country: 'Iceland',
    group: 'guide',
    south: 64.11,
    west: -21.98,
    north: 64.16,
    east: -21.83,
  },
  {
    key: 'lisbon',
    label: 'Lisbon',
    country: 'Portugal',
    group: 'guide',
    south: 38.69,
    west: -9.21,
    north: 38.76,
    east: -9.09,
  },
  {
    key: 'cusco',
    label: 'Cusco',
    country: 'Peru',
    group: 'guide',
    south: -13.56,
    west: -71.99,
    north: -13.49,
    east: -71.92,
  },
  {
    key: 'mexico-city',
    label: 'Mexico City',
    country: 'Mexico',
    group: 'guide',
    south: 19.34,
    west: -99.22,
    north: 19.48,
    east: -99.05,
  },
];

/** Cities whose `group` is in `groups`, in `CITIES` order. Unknown group names yield none. */
export function citiesInGroups(groups: readonly string[]): CityBbox[] {
  const wanted = new Set(groups);
  return CITIES.filter((city) => wanted.has(city.group));
}

/** Deterministic 32-bit PRNG (mulberry32): same seed always yields the same sequence in [0, 1). */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LatLng {
  readonly lat: number;
  readonly lon: number;
}

/** Uniformly samples one point inside `bbox` using `rng` (expected to return values in [0, 1)). */
export function samplePointInBbox(bbox: CityBbox, rng: () => number): LatLng {
  return {
    lat: bbox.south + (bbox.north - bbox.south) * rng(),
    lon: bbox.west + (bbox.east - bbox.west) * rng(),
  };
}

/** Uniformly samples `count` independent points inside `bbox`. */
export function samplePointsInBbox(bbox: CityBbox, rng: () => number, count: number): LatLng[] {
  return Array.from({ length: count }, () => samplePointInBbox(bbox, rng));
}
