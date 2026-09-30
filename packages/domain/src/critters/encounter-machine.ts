/**
 * The encounter reducer (docs/data-model-sync-and-privacy.md §3.4), shared by the app's engine and
 * the server's tests: `idle → accruing` on entering the spawn, `→ ready` once dwell reaches the
 * rule's `dwell_s`, `→ befriended` on the hold (or the accessible tap) while ready.
 * `accruing|ready → draining` on leaving; after the grace period the ring drains at `drain_ratio`
 * of the fill speed, `→ accruing|ready` on return, `→ wandered_off` when it empties.
 *
 * Dwell counts only between two consecutive accurate fixes inside the radius (the accuracy gate);
 * leaving needs radius + max(hysteresis_min_m, accuracy), so jitter at the edge never exits. Time
 * comes from the events (`at_ms`), never a clock, so a replay gives the same states.
 */
import type { EncounterConfig } from './config';

export const ENCOUNTER_PHASES = [
  'idle',
  'accruing',
  'ready',
  'draining',
  'befriended',
  'wandered_off',
] as const;
export type EncounterPhase = (typeof ENCOUNTER_PHASES)[number];

export interface EncounterState {
  readonly phase: EncounterPhase;
  /** Ring fill in dwell seconds (0 … dwell_target_s, may exceed it while ready). */
  readonly dwell_s: number;
  readonly dwell_target_s: number;
  readonly radius_m: number;
  /** Inside the spawn by the hysteresis rule. */
  readonly inside: boolean;
  /** The last fix was inside and within the accuracy gate: time since it counts. */
  readonly counting: boolean;
  readonly last_at_ms: number | null;
  readonly left_at_ms: number | null;
  readonly ready_at_ms: number | null;
  readonly resolved_at_ms: number | null;
}

export type EncounterEvent =
  | {
      readonly type: 'fix';
      readonly at_ms: number;
      readonly distance_m: number;
      readonly accuracy_m: number;
    }
  | { readonly type: 'tick'; readonly at_ms: number }
  | { readonly type: 'leave'; readonly at_ms: number }
  | { readonly type: 'hold'; readonly at_ms: number };

export function initialEncounterState(input: {
  readonly dwell_target_s: number;
  readonly radius_m: number;
}): EncounterState {
  return {
    phase: 'idle',
    dwell_s: 0,
    dwell_target_s: input.dwell_target_s,
    radius_m: input.radius_m,
    inside: false,
    counting: false,
    last_at_ms: null,
    left_at_ms: null,
    ready_at_ms: null,
    resolved_at_ms: null,
  };
}

const isTerminal = (phase: EncounterPhase): boolean =>
  phase === 'befriended' || phase === 'wandered_off';

/** Seconds of drain in (from, to]: nothing during grace, then drain_ratio per second. */
function drainBetween(state: EncounterState, to: number, config: EncounterConfig): number {
  if (state.left_at_ms === null || state.last_at_ms === null) return 0;
  const drainStart = state.left_at_ms + config.grace_s * 1000;
  const from = Math.max(state.last_at_ms, drainStart);
  if (to <= from) return 0;
  return ((to - from) / 1000) * config.drain_ratio;
}

/** Moves the ring to `at_ms`: fill while counting, drain while out past grace. */
function advance(state: EncounterState, at: number, config: EncounterConfig): EncounterState {
  if (state.last_at_ms === null || at <= state.last_at_ms) {
    return { ...state, last_at_ms: Math.max(at, state.last_at_ms ?? at) };
  }
  if (state.phase === 'draining') {
    const dwell = state.dwell_s - drainBetween(state, at, config);
    if (dwell <= 0) {
      return { ...state, dwell_s: 0, phase: 'wandered_off', last_at_ms: at, resolved_at_ms: at };
    }
    return { ...state, dwell_s: dwell, last_at_ms: at };
  }
  if (!state.counting) return { ...state, last_at_ms: at };
  const dwell = state.dwell_s + (at - state.last_at_ms) / 1000;
  return withReady({ ...state, dwell_s: dwell, last_at_ms: at });
}

function withReady(state: EncounterState): EncounterState {
  if (state.phase === 'accruing' && state.dwell_s >= state.dwell_target_s) {
    return { ...state, phase: 'ready', ready_at_ms: state.ready_at_ms ?? state.last_at_ms };
  }
  return state;
}

function leave(state: EncounterState, at: number): EncounterState {
  if (state.phase !== 'accruing' && state.phase !== 'ready') {
    return { ...state, inside: false, counting: false };
  }
  return { ...state, phase: 'draining', inside: false, counting: false, left_at_ms: at };
}

function enter(state: EncounterState, accurate: boolean): EncounterState {
  const back = state.phase === 'idle' || state.phase === 'draining';
  const phase: EncounterPhase = back
    ? state.dwell_s >= state.dwell_target_s
      ? 'ready'
      : 'accruing'
    : state.phase;
  return {
    ...state,
    phase,
    inside: true,
    counting: accurate,
    left_at_ms: back ? null : state.left_at_ms,
  };
}

function onFix(
  state: EncounterState,
  fix: Extract<EncounterEvent, { type: 'fix' }>,
  config: EncounterConfig,
): EncounterState {
  const accurate = fix.accuracy_m <= config.accuracy_gate_m;
  const exitAt = state.radius_m + Math.max(config.hysteresis_min_m, fix.accuracy_m);
  if (state.inside) {
    if (fix.distance_m > exitAt) return leave(state, fix.at_ms);
    // In the hysteresis band (or with a poor fix) the ring holds: no fill, no exit.
    return { ...state, counting: accurate && fix.distance_m <= state.radius_m };
  }
  // Entering needs an accurate fix inside the radius itself.
  if (accurate && fix.distance_m <= state.radius_m) return enter(state, true);
  return state;
}

export function reduceEncounter(
  state: EncounterState,
  event: EncounterEvent,
  config: EncounterConfig,
): EncounterState {
  if (isTerminal(state.phase)) return state;
  const advanced = advance(state, event.at_ms, config);
  if (isTerminal(advanced.phase)) return advanced;
  switch (event.type) {
    case 'tick':
      return advanced;
    case 'leave':
      return advanced.inside ? leave(advanced, event.at_ms) : advanced;
    case 'hold':
      if (advanced.phase !== 'ready' || !advanced.inside) return advanced;
      return { ...advanced, phase: 'befriended', resolved_at_ms: event.at_ms };
    case 'fix':
      return onFix(advanced, event, config);
  }
}

/** Ring fill 0…1 for the UI. */
export function encounterProgress(state: EncounterState): number {
  if (state.dwell_target_s <= 0) return 1;
  return Math.max(0, Math.min(1, state.dwell_s / state.dwell_target_s));
}
