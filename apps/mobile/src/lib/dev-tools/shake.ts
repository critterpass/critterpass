/**
 * Recognises a deliberate shake in a stream of accelerometer samples (m/s²). One function over
 * plain values so it runs as a worklet on the sensor's thread and under Jest alike.
 *
 * iOS reports raw acceleration (gravity included), Android linear acceleration (gravity removed),
 * so gravity is estimated with a slow low-pass and subtracted: both platforms then see only the
 * movement. A shake is several hard pushes in opposing directions inside about a second; walking
 * never pushes that hard, and putting the phone down pushes hard once or twice, not four times.
 */

/** A push counts when it is harder than this (about 1.7 g), far above walking or a tap. */
export const SHAKE_FORCE = 17;
/** Direction changes between hard pushes that make a shake. */
export const SHAKE_REVERSALS = 4;
/** The reversals must fit in this window. */
export const SHAKE_WINDOW_MS = 1200;
/** After a shake fires, nothing fires again for this long: one shake opens once. */
export const SHAKE_COOLDOWN_MS = 2500;
/** Hard pushes further apart than this are separate movements, not one shake. */
export const SHAKE_PUSH_GAP_MS = 500;
/** How slowly the gravity estimate follows the samples. */
const GRAVITY_TAU_MS = 300;

export interface ShakeSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ShakeState {
  /** False until the first sample seeds the gravity estimate. */
  readonly primed: boolean;
  readonly at: number;
  readonly gx: number;
  readonly gy: number;
  readonly gz: number;
  /** Direction and time of the last hard push (`-Infinity` before one). */
  readonly px: number;
  readonly py: number;
  readonly pz: number;
  readonly pushAt: number;
  /** When each counted reversal happened, oldest first. */
  readonly reversals: readonly number[];
  /** When the last shake fired; `-Infinity` before one. */
  readonly firedAt: number;
  /** True on the one step that completes a shake. */
  readonly fired: boolean;
}

export const INITIAL_SHAKE_STATE: ShakeState = {
  primed: false,
  at: 0,
  gx: 0,
  gy: 0,
  gz: 0,
  px: 0,
  py: 0,
  pz: 0,
  pushAt: -Infinity,
  reversals: [],
  firedAt: -Infinity,
  fired: false,
};

/** Feeds one sample taken at `nowMs`; `fired` is true on the step that completes a shake. */
export function stepShake(state: ShakeState, sample: ShakeSample, nowMs: number): ShakeState {
  'worklet';
  if (!state.primed) {
    return { ...state, primed: true, at: nowMs, gx: sample.x, gy: sample.y, gz: sample.z };
  }
  const dt = Math.max(0, nowMs - state.at);
  const keep = Math.exp(-dt / GRAVITY_TAU_MS);
  const gx = sample.x + (state.gx - sample.x) * keep;
  const gy = sample.y + (state.gy - sample.y) * keep;
  const gz = sample.z + (state.gz - sample.z) * keep;
  // Movement only: the sample against the gravity estimate from before it.
  const mx = sample.x - state.gx;
  const my = sample.y - state.gy;
  const mz = sample.z - state.gz;
  const base = { ...state, at: nowMs, gx, gy, gz, fired: false };

  if (nowMs - state.firedAt < SHAKE_COOLDOWN_MS) return base;
  if (Math.hypot(mx, my, mz) < SHAKE_FORCE) return base;

  const fresh = nowMs - state.pushAt <= SHAKE_PUSH_GAP_MS;
  // The first push, or one after a quiet spell: the count starts over from it.
  if (!fresh) return { ...base, px: mx, py: my, pz: mz, pushAt: nowMs, reversals: [] };
  // Still pushing the same way: one push, however many samples it spans.
  if (mx * state.px + my * state.py + mz * state.pz >= 0) return { ...base, pushAt: nowMs };

  const reversals = [...state.reversals.filter((at) => nowMs - at <= SHAKE_WINDOW_MS), nowMs];
  if (reversals.length >= SHAKE_REVERSALS) {
    return { ...base, pushAt: -Infinity, reversals: [], firedAt: nowMs, fired: true };
  }
  return { ...base, px: mx, py: my, pz: mz, pushAt: nowMs, reversals };
}
