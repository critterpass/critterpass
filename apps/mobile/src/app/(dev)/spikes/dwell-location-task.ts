// Background location task: registered once at module load (expo-task-manager requires this to
// happen outside the React tree so the OS can resume it after a relaunch). Bridges expo-location's
// task callback into the dwell-ring reducer and a tiny subscriber list the screen can listen to.
// Not a route — see the default export at the bottom.
import type * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { INITIAL_DWELL_STATE, stepDwellState } from './dwell-ring';
import type { DwellConfig, DwellState, GeoPoint } from './dwell-ring';

export const LOCATION_TASK_NAME = 'critterpass-spike-dwell-location-task';

export const DEFAULT_DWELL_CONFIG: DwellConfig = {
  radiusMeters: 50,
  thresholdSeconds: 120,
  graceSeconds: 20,
  drainPerSecond: 1 / 30,
};

interface TaskLocationsPayload {
  readonly locations: readonly Location.LocationObject[];
}

let poi: GeoPoint | null = null;
let config: DwellConfig = DEFAULT_DWELL_CONFIG;
let dwellState: DwellState = INITIAL_DWELL_STATE;
let previousFixTimestampMs: number | null = null;
let lastFix: Location.LocationObject | null = null;
type Listener = (state: DwellState, fix: Location.LocationObject) => void;
const listeners = new Set<Listener>();

export function configureDwellTarget(nextPoi: GeoPoint, nextConfig: DwellConfig = DEFAULT_DWELL_CONFIG): void {
  poi = nextPoi;
  config = nextConfig;
  dwellState = INITIAL_DWELL_STATE;
  previousFixTimestampMs = null;
}

export function subscribeDwellUpdates(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDwellSnapshot(): { state: DwellState; fix: Location.LocationObject | null } {
  return { state: dwellState, fix: lastFix };
}

function ingestFix(fix: Location.LocationObject): void {
  lastFix = fix;
  if (!poi) return; // no POI configured yet — nothing to compute against
  dwellState = stepDwellState(
    dwellState,
    { lat: fix.coords.latitude, lon: fix.coords.longitude, timestampMs: fix.timestamp },
    previousFixTimestampMs,
    poi,
    config,
  );
  previousFixTimestampMs = fix.timestamp;
  listeners.forEach((listener) => listener(dwellState, fix));
}

/** Exposed for the manual/simulated-fix path (e.g. a debug button, or a GPX-driven simctl/adb run
 * feeding real OS location updates through the normal watch below instead). */
export function ingestManualFix(fix: Location.LocationObject): void {
  ingestFix(fix);
}

// TaskManagerTaskExecutor requires a Promise-returning callback even though this work is
// synchronous; returning Promise.resolve() below satisfies that without a pointless await.
TaskManager.defineTask<TaskLocationsPayload>(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    console.error('dwell-location-task:', error.message);
    return Promise.resolve();
  }
  data?.locations.forEach(ingestFix);
  return Promise.resolve();
});

// See critter-geometry.ts's header: not a screen, only a background-task helper next to routes.
export default {};
