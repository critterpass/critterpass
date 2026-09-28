/**
 * The battery budget: which accuracy the engine may use right now, and the per-day allowance of
 * high-accuracy minutes (server config, default 90). High accuracy only inside a planned geofence
 * or during an active share or encounter; a stationary phone pauses updates; Low Power Mode or
 * battery saver drops to coarse. The accountant keys days on the device's local date.
 */

export const DEFAULT_HIGH_ACCURACY_CAP_MS = 90 * 60_000;

export type AccuracyTier = 'high' | 'balanced' | 'coarse' | 'paused';

export interface BudgetState {
  /** Local `YYYY-MM-DD` the counters belong to. */
  readonly day: string;
  readonly highMs: number;
  /** Start of the high-accuracy stretch in progress (epoch ms), if any. */
  readonly highSince: number | null;
  /** Location updates received today; the energy proxy recorded with the battery evidence. */
  readonly updates: number;
}

export function initialBudget(day: string): BudgetState {
  return { day, highMs: 0, highSince: null, updates: 0 };
}

/** Rolls the counters over when the local day changed (an open stretch restarts at `now`). */
export function rollBudget(state: BudgetState, day: string, now: number): BudgetState {
  if (state.day === day) return state;
  return { ...initialBudget(day), highSince: state.highSince === null ? null : now };
}

/** High-accuracy time used today, including the stretch still running. */
export function highAccuracyUsedMs(state: BudgetState, now: number): number {
  return state.highMs + (state.highSince === null ? 0 : Math.max(0, now - state.highSince));
}

/** Records a tier change at `now`: opens or closes the high-accuracy stretch. */
export function recordTier(state: BudgetState, tier: AccuracyTier, now: number): BudgetState {
  if (tier === 'high') return state.highSince === null ? { ...state, highSince: now } : state;
  if (state.highSince === null) return state;
  return { ...state, highMs: highAccuracyUsedMs(state, now), highSince: null };
}

export function recordUpdate(state: BudgetState): BudgetState {
  return { ...state, updates: state.updates + 1 };
}

export interface AccuracyNeeds {
  readonly insideGeofence: boolean;
  readonly activeShare: boolean;
  /** A Help or SOS share: never throttled, whatever the budget or power mode. */
  readonly emergencyShare: boolean;
  readonly activeEncounter: boolean;
  readonly stationary: boolean;
  readonly lowPower: boolean;
}

export function chooseAccuracy(
  needs: AccuracyNeeds,
  state: BudgetState,
  now: number,
  capMs: number = DEFAULT_HIGH_ACCURACY_CAP_MS,
): AccuracyTier {
  if (needs.emergencyShare) return 'high';
  // A live share keeps its viewers current even when the phone rests on a table.
  if (needs.stationary && !needs.activeShare) return 'paused';
  if (needs.lowPower) return 'coarse';
  const wantsHigh = needs.insideGeofence || needs.activeShare || needs.activeEncounter;
  if (!wantsHigh) return 'balanced';
  return highAccuracyUsedMs(state, now) < capMs ? 'high' : 'coarse';
}
