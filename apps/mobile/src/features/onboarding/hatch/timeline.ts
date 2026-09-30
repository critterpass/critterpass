/**
 * The launch hatch's choreography, as the design writes it (Critterpass Store Assets, "Splash
 * hatch"): the egg wobbles four times (0–1.3 s), bursts, Tokek pops out waving with three sparks
 * (1.6–2.1 s) and the CRITTER PASS wordmark rises in. Every `kf` below is the design's own string on
 * its 5200 ms preview loop; the app plays it once on one clock and stops when the wordmark lands.
 */
import { bezierEasing, linearEasing, type EasingFn } from '@/motion/easing';
import { compileKeyframes, type CompiledKeyframeStop } from '@/motion/dsl/compile';
import type { LoopTransform } from '@/motion/presets';

/** The design preview loop the keyframe fractions are written against. */
export const HATCH_LOOP_MS = 5200;

export interface HatchTrack {
  readonly stops: readonly CompiledKeyframeStop[];
  /** The easing leaving each stop, resolved once so the UI thread only calls it. */
  readonly eases: readonly EasingFn[];
}

function track(kf: string): HatchTrack {
  const stops = compileKeyframes(kf);
  return {
    stops,
    eases: stops.map(({ easing }) =>
      easing.kind === 'linear' ? linearEasing : bezierEasing(easing.bezier),
    ),
  };
}

/* eslint-disable lingui/no-unlocalized-strings -- design keyframe strings, never rendered. */
export const EGG = track(
  '0:r0 s1 o1;.05:r-9;.1:r9;.15:r-12;.2:r12;.26:r0 s1.08 e=out;.32:s1.4 o0;.95:s1.4 o0;.96:s1 o0;1:s1 o1',
);
export const TOKEK = track('0:s0 o0;.3:s0 o0 e=back;.4:s1 o1;.9:s1 o1;.95:s0 o0;1:s0 o0');
/** The design's `wiggle` preset at `dur="1400"`, Tokek's wave while he is out. */
export const TOKEK_WIGGLE = track('0:r-4;.5:r4;1:r-4');
export const TOKEK_WIGGLE_MS = 1400;
export const WORDMARK = track('0:ty24 o0;.4:ty24 o0 e=out;.5:ty0 o1;.9:ty0 o1;.95:o0;1:o0');

export interface SparkSpec {
  readonly track: HatchTrack;
  /** Top-left of the spark relative to the screen centre, in points. */
  readonly left: number;
  readonly top: number;
  readonly size: number;
  readonly accent: 'yellow' | 'pink' | 'green';
}

export const SPARKS: readonly SparkSpec[] = [
  {
    track: track('0:s0 o0;.3:s0 o0 e=back;.38:s1 o1;.55:s1.2 o0;1:s1.2 o0'),
    left: -130,
    top: -150,
    size: 34,
    accent: 'yellow',
  },
  {
    track: track('0:s0 o0;.32:s0 o0 e=back;.4:s1 o1;.58:s1.2 o0;1:s1.2 o0'),
    left: 96,
    top: -120,
    size: 26,
    accent: 'pink',
  },
  {
    track: track('0:s0 o0;.34:s0 o0 e=back;.42:s1 o1;.6:s1.2 o0;1:s1.2 o0'),
    left: -110,
    top: 10,
    size: 22,
    accent: 'green',
  },
];
/* eslint-enable lingui/no-unlocalized-strings */

/** Layout relative to the screen centre, from the design's 390 × 844 phone. */
export const LAYOUT = {
  /** iOS: the launch image's egg (120 pt box), also the hatch's first frame. */
  egg: { left: -60, top: -110, size: 120 },
  /** Android: the system splash icon canvas (288 dp, the egg inside its 192 dp mask). */
  androidEgg: { size: 288 },
  /** The launch image square that carries the halftone glow. */
  glow: { size: 736 },
  tokek: { left: -85, top: -150, size: 170 },
  /** The wordmark's top edge: 520 pt down an 844 pt screen. */
  wordmarkTop: 520 - 844 / 2,
} as const;

const at = (fraction: number) => fraction * HATCH_LOOP_MS;

/** The egg starts to burst: where Android (its system splash already wobbled) and later launches begin. */
export const BURST_MS = at(0.26);
/** Tokek has landed. */
export const TOKEK_LANDED_MS = at(0.4);
/** The wordmark has landed: the full hatch hands over to the welcome screen here. */
export const HATCH_END_MS = at(0.5);

export interface HatchPlan {
  /** Design-clock span played, in design milliseconds. */
  readonly from: number;
  readonly to: number;
  /** Real time the span takes. */
  readonly playMs: number;
  /** Real time the last frame holds before the fade. */
  readonly holdMs: number;
  readonly fadeMs: number;
}

/** Later launches: from the burst to Tokek landing, sped up to fit 700 ms with its fade. */
export const BEAT_PLAN: HatchPlan = {
  from: BURST_MS,
  to: TOKEK_LANDED_MS,
  playMs: 540,
  holdMs: 0,
  fadeMs: 160,
};
export const BEAT_REDUCED_PLAN: HatchPlan = {
  from: TOKEK_LANDED_MS,
  to: TOKEK_LANDED_MS,
  playMs: 0,
  holdMs: 450,
  fadeMs: 200,
};

/** The first launch. Android's system splash has already wobbled the egg, so it starts at the burst. */
export function firstHatchPlan(os: string): HatchPlan {
  const from = os === 'android' ? BURST_MS : 0;
  return { from, to: HATCH_END_MS, playMs: HATCH_END_MS - from, holdMs: 0, fadeMs: 250 };
}
export const FIRST_REDUCED_PLAN: HatchPlan = {
  from: HATCH_END_MS,
  to: HATCH_END_MS,
  playMs: 0,
  holdMs: 700,
  fadeMs: 200,
};

/** One track's transform at `ms` on the design clock (clamped to its first and last stops). */
export function sampleTrack({ stops, eases }: HatchTrack, ms: number): LoopTransform {
  'worklet';
  const phase = ms / HATCH_LOOP_MS;
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (first === undefined || last === undefined) return { tx: 0, ty: 0, r: 0, sx: 1, sy: 1, o: 1 };
  if (phase <= first.at) return first.transform;
  if (phase >= last.at) return last.transform;
  let i = 0;
  while (i < stops.length - 2 && phase > (stops[i + 1]?.at ?? 1)) i += 1;
  const from = stops[i] ?? first;
  const to = stops[i + 1] ?? last;
  const span = to.at - from.at;
  const ease = eases[i] ?? linearEasing;
  const t = ease(span > 0 ? (phase - from.at) / span : 1);
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    tx: mix(from.transform.tx, to.transform.tx),
    ty: mix(from.transform.ty, to.transform.ty),
    r: mix(from.transform.r, to.transform.r),
    sx: mix(from.transform.sx, to.transform.sx),
    sy: mix(from.transform.sy, to.transform.sy),
    o: mix(from.transform.o, to.transform.o),
  };
}

/** A looping track (Tokek's wiggle) at `ms`, with its own period. */
export function sampleLoop(loop: HatchTrack, periodMs: number, ms: number): LoopTransform {
  'worklet';
  const phase = (((ms % periodMs) + periodMs) % periodMs) / periodMs;
  return sampleTrack(loop, phase * HATCH_LOOP_MS);
}
