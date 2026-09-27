/**
 * The geofence planner. The OS monitors few regions (iOS `CLMonitor` 20, Android geofencing 100)
 * and none reliably below ~150 m, so the planner picks the nearest candidates from every
 * registered source, floors each radius at 150 m, and re-plans after a significant move (1 km) or
 * every 15 minutes. Fine dwell (50 m rings, visits) runs on the live fix stream inside those
 * regions, never on the OS callback itself.
 *
 * Sources register by name. This module registers plan POIs and the stay; spawn spots register
 * their own source (`registerGeofenceSource('spawns', fn)`) where they are built.
 */
import { distanceM, type LatLng } from './geo';

export const IOS_MONITOR_LIMIT = 20;
export const ANDROID_GEOFENCE_LIMIT = 100;
export const MIN_GEOFENCE_RADIUS_M = 150;
export const REPLAN_DISTANCE_M = 1000;
export const REPLAN_INTERVAL_MS = 15 * 60_000;
/** Region id of the "moved far enough" boundary that wakes the app to re-plan. */
export const REPLAN_REGION_ID = 'replan';

export interface GeofenceCandidate extends LatLng {
  /** Unique within its source, e.g. the POI id. */
  readonly id: string;
  readonly radiusM: number;
}

export interface PlanPoi extends LatLng {
  readonly id: string;
  readonly radiusM: number | null;
}

export interface GeofenceSourceContext {
  readonly tripId: string;
  /** Today's plan POIs (from the trip pack). */
  readonly planPois: readonly PlanPoi[];
  /** Where the user sleeps tonight, when booked. */
  readonly stay: PlanPoi | null;
}

export type GeofenceSource = (ctx: GeofenceSourceContext) => readonly GeofenceCandidate[];

export interface PlannedRegion extends LatLng {
  /** `<source>:<candidate id>`, or `replan`. */
  readonly id: string;
  readonly source: string;
  readonly radiusM: number;
  readonly distanceM: number;
}

export interface GeofencePlan {
  readonly center: LatLng;
  readonly plannedAt: number;
  readonly regions: readonly PlannedRegion[];
}

export interface GeofenceSourceRegistry {
  register(name: string, source: GeofenceSource): () => void;
  names(): readonly string[];
  collect(ctx: GeofenceSourceContext): ReadonlyMap<string, readonly GeofenceCandidate[]>;
}

export function createGeofenceSourceRegistry(): GeofenceSourceRegistry {
  const sources = new Map<string, GeofenceSource>();
  return {
    register(name, source) {
      if (!/^[a-z][a-z0-9_]*$/u.test(name)) throw new Error(`invalid geofence source "${name}"`);
      if (sources.has(name)) throw new Error(`geofence source "${name}" is already registered`);
      sources.set(name, source);
      return () => {
        if (sources.get(name) === source) sources.delete(name);
      };
    },
    names: () => [...sources.keys()].sort(),
    collect(ctx) {
      const out = new Map<string, readonly GeofenceCandidate[]>();
      for (const [name, source] of sources) out.set(name, source(ctx));
      return out;
    },
  };
}

const withRadius = (poi: PlanPoi): GeofenceCandidate => ({
  id: poi.id,
  lat: poi.lat,
  lng: poi.lng,
  radiusM: poi.radiusM ?? MIN_GEOFENCE_RADIUS_M,
});

export const planPoisSource: GeofenceSource = (ctx) => ctx.planPois.map(withRadius);
export const staySource: GeofenceSource = (ctx) =>
  ctx.stay === null ? [] : [withRadius(ctx.stay)];

/** The app-wide registry the location engine plans from. */
export const geofenceSources: GeofenceSourceRegistry = createGeofenceSourceRegistry();
geofenceSources.register('plan_pois', planPoisSource);
geofenceSources.register('stay', staySource);

export function registerGeofenceSource(name: string, source: GeofenceSource): () => void {
  return geofenceSources.register(name, source);
}

export interface PlanOptions {
  /** OS limit for the platform: `IOS_MONITOR_LIMIT` or `ANDROID_GEOFENCE_LIMIT`. */
  readonly max: number;
  readonly minRadiusM?: number;
  /** Reserve one slot for a boundary around `center` whose exit wakes the app to re-plan. */
  readonly replanRegion?: boolean;
  readonly replanDistanceM?: number;
}

export function planGeofences(
  center: LatLng,
  candidates: ReadonlyMap<string, readonly GeofenceCandidate[]>,
  now: number,
  options: PlanOptions,
): GeofencePlan {
  const minRadiusM = options.minRadiusM ?? MIN_GEOFENCE_RADIUS_M;
  const replanDistanceM = options.replanDistanceM ?? REPLAN_DISTANCE_M;
  const slots = Math.max(0, options.max - (options.replanRegion === true ? 1 : 0));
  const seen = new Set<string>();
  const ranked: PlannedRegion[] = [];
  for (const [source, list] of candidates) {
    for (const candidate of list) {
      const id = `${source}:${candidate.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      ranked.push({
        id,
        source,
        lat: candidate.lat,
        lng: candidate.lng,
        radiusM: Math.max(minRadiusM, candidate.radiusM),
        distanceM: distanceM(center, candidate),
      });
    }
  }
  ranked.sort((a, b) => a.distanceM - b.distanceM || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const regions = ranked.slice(0, slots);
  if (options.replanRegion === true && options.max > 0) {
    regions.push({
      id: REPLAN_REGION_ID,
      source: REPLAN_REGION_ID,
      lat: center.lat,
      lng: center.lng,
      radiusM: replanDistanceM,
      distanceM: 0,
    });
  }
  return { center, plannedAt: now, regions };
}

export function shouldReplan(
  last: GeofencePlan | null,
  position: LatLng,
  now: number,
  options: { readonly distanceM?: number; readonly intervalMs?: number } = {},
): boolean {
  if (last === null) return true;
  if (now - last.plannedAt >= (options.intervalMs ?? REPLAN_INTERVAL_MS)) return true;
  return distanceM(last.center, position) >= (options.distanceM ?? REPLAN_DISTANCE_M);
}
