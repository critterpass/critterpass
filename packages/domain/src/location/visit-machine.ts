/**
 * POI visit detection, one machine per POI: outside → candidate → inside → leaving → (left) →
 * outside. Arrived = inside the POI radius with good accuracy for the whole dwell; left = beyond
 * radius + hysteresis for the leave time. Only these two instants ever leave the device (as a
 * `record_visit`), never the fixes that produced them.
 *
 * `tick` events let a stationary phone finish a dwell: the OS stops sending fixes when the device
 * does not move, so the last position holds until a fix says otherwise.
 */
import type { PoiCategory } from '../places/categories';

export interface VisitParams {
  readonly radiusM: number;
  /** Extra distance beyond the radius before leaving starts, so GPS jitter at the edge never ends a visit. */
  readonly hysteresisM: number;
  readonly dwellMs: number;
  readonly leaveMs: number;
  /** Fixes worse than this are ignored. */
  readonly maxAccuracyM: number;
}

export const DEFAULT_VISIT_PARAMS: VisitParams = {
  radiusM: 100,
  hysteresisM: 60,
  dwellMs: 3 * 60_000,
  leaveMs: 2 * 60_000,
  maxAccuracyM: 50,
};

/** Category defaults: radius 60–150 m; restaurants 10 min and temples 5 min of dwell, else 3. */
export const VISIT_CATEGORY_DEFAULTS: Readonly<
  Record<PoiCategory, { readonly radiusM: number; readonly dwellMs: number }>
> = {
  temple_shrine: { radiusM: 80, dwellMs: 5 * 60_000 },
  food: { radiusM: 60, dwellMs: 10 * 60_000 },
  market: { radiusM: 100, dwellMs: 3 * 60_000 },
  nature: { radiusM: 150, dwellMs: 3 * 60_000 },
  beach: { radiusM: 150, dwellMs: 3 * 60_000 },
  museum: { radiusM: 80, dwellMs: 3 * 60_000 },
  nightlife: { radiusM: 60, dwellMs: 3 * 60_000 },
  shopping: { radiusM: 80, dwellMs: 3 * 60_000 },
  transit: { radiusM: 100, dwellMs: 3 * 60_000 },
  stay: { radiusM: 80, dwellMs: 3 * 60_000 },
  health: { radiusM: 60, dwellMs: 3 * 60_000 },
  other: { radiusM: 80, dwellMs: 3 * 60_000 },
};

/** Params for one POI: its own curated radius wins over the category default. */
export function visitParamsFor(
  category: PoiCategory,
  poiRadiusM: number | null,
  overrides: Partial<VisitParams> = {},
): VisitParams {
  const base = VISIT_CATEGORY_DEFAULTS[category];
  return {
    ...DEFAULT_VISIT_PARAMS,
    radiusM: poiRadiusM ?? base.radiusM,
    dwellMs: base.dwellMs,
    ...overrides,
  };
}

export type VisitPhase = 'outside' | 'candidate' | 'inside' | 'leaving';

/** `lastAt` is the latest input time (null before the first); older inputs are ignored. */
export type VisitState =
  | { readonly phase: 'outside'; readonly lastAt: number | null }
  /** `since` = first good fix inside the radius. */
  | { readonly phase: 'candidate'; readonly since: number; readonly lastAt: number }
  | { readonly phase: 'inside'; readonly arrivedAt: number; readonly lastAt: number }
  /** `since` = first good fix beyond radius + hysteresis. */
  | {
      readonly phase: 'leaving';
      readonly arrivedAt: number;
      readonly since: number;
      readonly lastAt: number;
    };

export const INITIAL_VISIT_STATE: VisitState = { phase: 'outside', lastAt: null };

export type VisitInput =
  | {
      readonly type: 'fix';
      readonly at: number;
      readonly distanceM: number;
      readonly accuracyM: number;
    }
  | { readonly type: 'tick'; readonly at: number };

export type VisitEmit =
  | { readonly type: 'arrived'; readonly arrivedAt: number }
  | { readonly type: 'left'; readonly arrivedAt: number; readonly leftAt: number };

export interface VisitStep {
  readonly state: VisitState;
  readonly emit: VisitEmit | null;
}

const stay = (state: VisitState, at: number): VisitStep => ({
  state: { ...state, lastAt: at },
  emit: null,
});

function onTick(state: VisitState, at: number, params: VisitParams): VisitStep {
  switch (state.phase) {
    case 'candidate':
      return at - state.since >= params.dwellMs
        ? {
            state: { phase: 'inside', arrivedAt: state.since, lastAt: at },
            emit: { type: 'arrived', arrivedAt: state.since },
          }
        : stay(state, at);
    case 'leaving':
      return at - state.since >= params.leaveMs
        ? {
            state: { phase: 'outside', lastAt: at },
            emit: { type: 'left', arrivedAt: state.arrivedAt, leftAt: state.since },
          }
        : stay(state, at);
    case 'outside':
    case 'inside':
      return stay(state, at);
  }
}

function onFix(
  state: VisitState,
  input: Extract<VisitInput, { type: 'fix' }>,
  params: VisitParams,
): VisitStep {
  const at = input.at;
  if (input.accuracyM > params.maxAccuracyM) return onTick(state, at, params);
  const inRadius = input.distanceM <= params.radiusM;
  const inHysteresis = input.distanceM <= params.radiusM + params.hysteresisM;
  switch (state.phase) {
    case 'outside':
      return inRadius
        ? { state: { phase: 'candidate', since: at, lastAt: at }, emit: null }
        : stay(state, at);
    case 'candidate':
      return inRadius
        ? onTick(state, at, params)
        : { state: { phase: 'outside', lastAt: at }, emit: null };
    case 'inside':
      return inHysteresis
        ? stay(state, at)
        : {
            state: { phase: 'leaving', arrivedAt: state.arrivedAt, since: at, lastAt: at },
            emit: null,
          };
    case 'leaving':
      return inHysteresis
        ? { state: { phase: 'inside', arrivedAt: state.arrivedAt, lastAt: at }, emit: null }
        : onTick(state, at, params);
  }
}

export function stepVisit(state: VisitState, input: VisitInput, params: VisitParams): VisitStep {
  if (state.lastAt !== null && input.at < state.lastAt) return { state, emit: null };
  return input.type === 'tick' ? onTick(state, input.at, params) : onFix(state, input, params);
}
