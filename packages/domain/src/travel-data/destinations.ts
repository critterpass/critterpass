/**
 * Travel-data reference points for the six live destinations (docs/product-decisions.md §6): the
 * airports fares are priced into, the weather centroid and its elevation, a coastal point for marine
 * forecasts, summits whose temperatures are lapse-rate adjusted, and the hazard subjects each feed is
 * watched for. Keyed by `destinations.slug`; a destination absent here has no fares, weather or
 * hazard feed (guest-guide destinations), and every consumer shows its missing-data state.
 */
import type { HazardSource } from './types';

export interface TravelPoint {
  readonly lat: number;
  readonly lng: number;
}

export interface TravelSummit extends TravelPoint {
  readonly name: string;
  readonly elevation_m: number;
}

export interface TravelHazardSubject {
  readonly source: HazardSource;
  /** The feed's own name for the subject (volcano name, or JMA area code for warnings). */
  readonly subject: string;
}

export interface TravelDestination {
  /** Fares are priced into the first airport; the rest are alternates in preference order. */
  readonly airports: readonly [string, ...string[]];
  readonly centroid: TravelPoint & { readonly elevation_m: number };
  readonly marine: TravelPoint | null;
  readonly summits: readonly TravelSummit[];
  readonly hazards: readonly TravelHazardSubject[];
}

export const TRAVEL_DESTINATIONS: Readonly<Record<string, TravelDestination>> = {
  bali: {
    airports: ['DPS'],
    centroid: { lat: -8.5069, lng: 115.2625, elevation_m: 200 },
    marine: { lat: -8.53, lng: 115.51 },
    summits: [{ name: 'Mount Batur', lat: -8.242, lng: 115.375, elevation_m: 1717 }],
    hazards: [
      { source: 'magma', subject: 'Batur' },
      { source: 'magma', subject: 'Agung' },
      { source: 'magma', subject: 'Rinjani' },
      { source: 'gdacs', subject: 'Batur' },
      { source: 'gdacs', subject: 'Agung' },
    ],
  },
  kyoto: {
    airports: ['KIX', 'ITM'],
    centroid: { lat: 35.0116, lng: 135.7681, elevation_m: 50 },
    marine: null,
    summits: [],
    // JMA warnings for Kyoto prefecture's southern area (Kyoto city).
    hazards: [{ source: 'jma', subject: '260010' }],
  },
  iceland: {
    airports: ['KEF'],
    centroid: { lat: 64.1466, lng: -21.9426, elevation_m: 20 },
    marine: { lat: 64.15, lng: -21.95 },
    summits: [],
    hazards: [
      { source: 'imo', subject: 'Reykjanes' },
      { source: 'imo', subject: 'Grímsvötn' },
      { source: 'imo', subject: 'Bárðarbunga' },
      { source: 'imo', subject: 'Katla' },
      { source: 'imo', subject: 'Hekla' },
      { source: 'gdacs', subject: 'Reykjanes' },
    ],
  },
  'mexico-city': {
    airports: ['MEX'],
    centroid: { lat: 19.4326, lng: -99.1332, elevation_m: 2240 },
    marine: null,
    summits: [],
    hazards: [
      { source: 'cenapred', subject: 'Popocatepetl' },
      { source: 'gdacs', subject: 'Popocatepetl' },
    ],
  },
  lisbon: {
    airports: ['LIS'],
    centroid: { lat: 38.7223, lng: -9.1393, elevation_m: 50 },
    marine: { lat: 38.68, lng: -9.33 },
    summits: [],
    hazards: [],
  },
  cusco: {
    airports: ['CUZ'],
    centroid: { lat: -13.532, lng: -71.9675, elevation_m: 3400 },
    marine: null,
    summits: [
      { name: 'Machu Picchu', lat: -13.1631, lng: -72.545, elevation_m: 2430 },
      { name: 'Rainbow Mountain', lat: -13.8696, lng: -71.3031, elevation_m: 5036 },
    ],
    hazards: [],
  },
};

export function travelDestination(slug: string): TravelDestination | undefined {
  return TRAVEL_DESTINATIONS[slug];
}

/** Standard-atmosphere lapse rate: air cools about 6.5 °C per 1,000 m of height. */
export const LAPSE_RATE_C_PER_M = 0.0065;

/** A temperature forecast at `fromElevationM` carried to `toElevationM`, to one decimal. */
export function adjustTempForElevation(
  tempC: number,
  fromElevationM: number,
  toElevationM: number,
): number {
  return Math.round((tempC - (toElevationM - fromElevationM) * LAPSE_RATE_C_PER_M) * 10) / 10;
}
