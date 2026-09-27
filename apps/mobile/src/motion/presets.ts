import { tokens } from '@cp/design-tokens';

import { bezierEasing } from './easing';

export const LOOP_PRESET_IDS = [
  'bob',
  'float',
  'wiggle',
  'pulse',
  'ping',
  'spin',
  'marquee',
  'blink',
  'hop',
  'grow',
] as const;

export type LoopPresetId = (typeof LOOP_PRESET_IDS)[number];

/** Transform/opacity a keyframe stop may set; a stop that omits a prop carries the identity value. */
export interface LoopTransform {
  readonly tx: number;
  readonly ty: number;
  readonly r: number;
  readonly sx: number;
  readonly sy: number;
  readonly o: number;
}

const IDENTITY_TRANSFORM: LoopTransform = { tx: 0, ty: 0, r: 0, sx: 1, sy: 1, o: 1 };

export interface LoopKeyframeStop extends Partial<LoopTransform> {
  /** Phase within the loop cycle, 0 to 1 inclusive; the first and last stop should match visually. */
  readonly at: number;
}

export type LoopEasingId = 'inOut' | 'linear';

export interface LoopPresetDef {
  readonly id: LoopPresetId;
  /** Milliseconds for one full cycle (docs/design-system.md §3.1). */
  readonly durationMs: number;
  readonly easing: LoopEasingId;
  readonly stops: readonly LoopKeyframeStop[];
}

// `inOut` is the DSL's own default easing (motion.easing.inOut); `spin` and `marquee` are the two
// presets the design table marks "lin" (linear) instead.
const inOutEasing = bezierEasing(tokens.motion.easing.inOut);

/**
 * The 10 idle loop presets (docs/design-system.md §3.1), keyed by id. Every keyframe stop's numbers
 * come from that table; `hop`'s four named stages (squash, jump+stretch, land, rest) are spread
 * across stops at even quarters, and `grow`'s "600-900ms in app" range resolves to the `extra`
 * duration token (780ms), which sits inside it.
 */
export const LOOP_PRESETS: Readonly<Record<LoopPresetId, LoopPresetDef>> = {
  bob: {
    id: 'bob',
    durationMs: 2400,
    easing: 'inOut',
    stops: [
      { at: 0, ty: 0 },
      { at: 0.5, ty: -6 },
      { at: 1, ty: 0 },
    ],
  },
  float: {
    id: 'float',
    durationMs: 4200,
    easing: 'inOut',
    stops: [
      { at: 0, ty: 0, r: -2 },
      { at: 0.5, ty: -9, r: 2 },
      { at: 1, ty: 0, r: -2 },
    ],
  },
  wiggle: {
    id: 'wiggle',
    durationMs: 1600,
    easing: 'inOut',
    stops: [
      { at: 0, r: -4 },
      { at: 0.5, r: 4 },
      { at: 1, r: -4 },
    ],
  },
  pulse: {
    id: 'pulse',
    durationMs: 1600,
    easing: 'inOut',
    stops: [
      { at: 0, sx: 1, sy: 1 },
      { at: 0.5, sx: 1.07, sy: 1.07 },
      { at: 1, sx: 1, sy: 1 },
    ],
  },
  // Radar ring: scales and fades out once per cycle, then jumps back to the start (a second ring
  // uses `useLoop('ping', { offset: 0.5 })` to run half a cycle out of phase — "pairs offset ½").
  ping: {
    id: 'ping',
    durationMs: 1800,
    easing: 'inOut',
    stops: [
      { at: 0, sx: 0.6, sy: 0.6, o: 0.8 },
      { at: 1, sx: 1.5, sy: 1.5, o: 0 },
    ],
  },
  spin: {
    id: 'spin',
    durationMs: 9000,
    easing: 'linear',
    stops: [
      { at: 0, r: 0 },
      { at: 1, r: 360 },
    ],
  },
  // `tx` is a fraction of the marquee's own width (-0.5 = "-50%"); the consumer multiplies by layout width.
  marquee: {
    id: 'marquee',
    durationMs: 16000,
    easing: 'linear',
    stops: [
      { at: 0, tx: 0 },
      { at: 1, tx: -0.5 },
    ],
  },
  blink: {
    id: 'blink',
    durationMs: 1200,
    easing: 'inOut',
    stops: [
      { at: 0, o: 1 },
      { at: 0.5, o: 0.25 },
      { at: 1, o: 1 },
    ],
  },
  hop: {
    id: 'hop',
    durationMs: 2600,
    easing: 'inOut',
    stops: [
      { at: 0, ty: 0, sx: 1, sy: 1 },
      { at: 0.15, ty: 0, sx: 1.1, sy: 0.9 },
      { at: 0.5, ty: -14, sx: 0.95, sy: 1.05 },
      { at: 0.85, ty: 0, sx: 1.06, sy: 0.94 },
      { at: 1, ty: 0, sx: 1, sy: 1 },
    ],
  },
  grow: {
    id: 'grow',
    durationMs: tokens.motion.duration.extra,
    easing: 'inOut',
    stops: [
      { at: 0, sx: 0 },
      { at: 1, sx: 1 },
    ],
  },
} as const;

function resolveStopTransform(stop: LoopKeyframeStop): LoopTransform {
  'worklet';
  return {
    tx: stop.tx ?? IDENTITY_TRANSFORM.tx,
    ty: stop.ty ?? IDENTITY_TRANSFORM.ty,
    r: stop.r ?? IDENTITY_TRANSFORM.r,
    sx: stop.sx ?? IDENTITY_TRANSFORM.sx,
    sy: stop.sy ?? IDENTITY_TRANSFORM.sy,
    o: stop.o ?? IDENTITY_TRANSFORM.o,
  };
}

function lerp(from: number, to: number, t: number): number {
  'worklet';
  return from + (to - from) * t;
}

/**
 * Samples a loop preset at `phase` (any real number; only its fractional part in [0, 1) matters, so
 * the shared clock never needs to reset for a preset to keep looping). Interpolates between the two
 * keyframe stops bracketing `phase` using the preset's easing.
 */
export function sampleLoopPreset(def: LoopPresetDef, phase: number): LoopTransform {
  'worklet';
  const p = ((phase % 1) + 1) % 1;
  const stops = def.stops;
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];
  if (firstStop === undefined || lastStop === undefined) return IDENTITY_TRANSFORM;

  let lower = firstStop;
  let upper = lastStop;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (a === undefined || b === undefined) continue;
    if (p >= a.at && p <= b.at) {
      lower = a;
      upper = b;
      break;
    }
  }

  const span = upper.at - lower.at;
  const localT = span > 0 ? (p - lower.at) / span : 0;
  const eased = def.easing === 'linear' ? localT : inOutEasing(localT);
  const from = resolveStopTransform(lower);
  const to = resolveStopTransform(upper);
  return {
    tx: lerp(from.tx, to.tx, eased),
    ty: lerp(from.ty, to.ty, eased),
    r: lerp(from.r, to.r, eased),
    sx: lerp(from.sx, to.sx, eased),
    sy: lerp(from.sy, to.sy, eased),
    o: lerp(from.o, to.o, eased),
  };
}

/** The resting frame (t=0) a preset shows in reduced/off motion mode (design-system.md §5: "idle loops static"). */
export function restingLoopTransform(id: LoopPresetId): LoopTransform {
  'worklet';
  const def = LOOP_PRESETS[id];
  const firstStop = def.stops[0];
  return firstStop === undefined ? IDENTITY_TRANSFORM : resolveStopTransform(firstStop);
}
