// Pure dwell-ring calculation: encounter eligibility per product-decisions.md C19 ("Dwell = eligibility
// — ring fills with dwell, counts in background when permitted... grace + slow drain") and the fine
// dwell radius from system-architecture.md §4's platform-physics table ("Coarse geofence (≥150 m) or
// active WIU trip-day session → fine dwell by foreground/background location session"). Not a route
// — see the default export at the bottom.

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export interface LocationFix extends GeoPoint {
  readonly timestampMs: number;
}

export interface DwellConfig {
  /** Fine dwell radius — 50 m per phase-02's spec, well inside either OS's coarse geofence floor. */
  readonly radiusMeters: number;
  /** Continuous seconds inside the radius needed to fill the ring (progress = 1). */
  readonly thresholdSeconds: number;
  /** A brief step outside the radius within this window does not start draining the ring. */
  readonly graceSeconds: number;
  /** Ring fraction drained per second once outside the radius past the grace window. */
  readonly drainPerSecond: number;
}

export interface DwellState {
  readonly dwellSeconds: number;
  readonly progress: number;
  /** Fix timestamp of the last sample known to be inside the radius, or null if never inside. */
  readonly lastInsideAtMs: number | null;
}

export const INITIAL_DWELL_STATE: DwellState = { dwellSeconds: 0, progress: 0, lastInsideAtMs: null };

const EARTH_RADIUS_METERS = 6_371_000;

/** Great-circle distance between two points, in meters. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Advances the dwell ring by one location fix. Inside the radius, dwell time accumulates towards
 * `thresholdSeconds`. Outside, a brief `graceSeconds` window is free (GPS jitter, stepping around an
 * obstacle); past that, the ring drains at `drainPerSecond` rather than resetting instantly (C19's
 * "grace + slow drain", so a short step away does not throw away a near-complete encounter).
 */
export function stepDwellState(
  state: DwellState,
  fix: LocationFix,
  previousFixTimestampMs: number | null,
  poi: GeoPoint,
  config: DwellConfig,
): DwellState {
  const elapsedSeconds = previousFixTimestampMs === null ? 0 : Math.max(0, (fix.timestampMs - previousFixTimestampMs) / 1000);
  const inside = haversineMeters(fix, poi) <= config.radiusMeters;

  if (inside) {
    const dwellSeconds = Math.min(config.thresholdSeconds, state.dwellSeconds + elapsedSeconds);
    return { dwellSeconds, progress: clamp01(dwellSeconds / config.thresholdSeconds), lastInsideAtMs: fix.timestampMs };
  }

  const secondsSinceInside = state.lastInsideAtMs === null ? Infinity : (fix.timestampMs - state.lastInsideAtMs) / 1000;
  if (secondsSinceInside <= config.graceSeconds) {
    return state;
  }
  const dwellSeconds = Math.max(0, state.dwellSeconds - config.drainPerSecond * elapsedSeconds);
  return { dwellSeconds, progress: clamp01(dwellSeconds / config.thresholdSeconds), lastInsideAtMs: state.lastInsideAtMs };
}

/** Replays a whole fix series from the initial state — used by tests and the simulated-route harness. */
export function replayDwellSeries(fixes: readonly LocationFix[], poi: GeoPoint, config: DwellConfig): DwellState[] {
  const states: DwellState[] = [];
  let state = INITIAL_DWELL_STATE;
  let previousTimestampMs: number | null = null;
  for (const fix of fixes) {
    state = stepDwellState(state, fix, previousTimestampMs, poi, config);
    previousTimestampMs = fix.timestampMs;
    states.push(state);
  }
  return states;
}

// See critter-geometry.ts's header (same reason): not a screen, only a math helper next to routes.
export default {};
