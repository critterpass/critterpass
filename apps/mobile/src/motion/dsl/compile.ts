import { tokens } from '@cp/design-tokens';

import type { LoopTransform } from '../presets';
import { parseKeyframes } from './parse';
import type { CompiledEasing, CompiledKeyframeStop, RawKeyframeStop } from './types';

export type { CompiledEasing, CompiledKeyframeStop } from './types';

const IDENTITY_TRANSFORM: LoopTransform = { tx: 0, ty: 0, r: 0, sx: 1, sy: 1, o: 1 };

// The design's short easing aliases (design/*.dc.html `e=` tokens), mapped to the named motion
// tokens: `in`/`out` are entrances/exits, `io` is the DSL's own default, `back` matches the token of
// the same name, and `lin` has no bezier (a plain linear ramp — `spin`/`marquee` use it too).
const EASING_ALIASES: Readonly<Record<string, CompiledEasing>> = {
  in: { kind: 'bezier', bezier: tokens.motion.easing.enter },
  out: { kind: 'bezier', bezier: tokens.motion.easing.exit },
  io: { kind: 'bezier', bezier: tokens.motion.easing.inOut },
  back: { kind: 'bezier', bezier: tokens.motion.easing.back },
  lin: { kind: 'linear' },
};

const DEFAULT_EASING: CompiledEasing = { kind: 'bezier', bezier: tokens.motion.easing.inOut };

function resolveEasingAlias(alias: string | undefined): CompiledEasing {
  if (alias === undefined) return DEFAULT_EASING;
  const resolved = EASING_ALIASES[alias];
  if (!resolved) {
    // A developer-facing throw, never rendered — disabled for the whole (multi-line) statement below.
    /* eslint-disable lingui/no-unlocalized-strings */
    throw new Error(
      `tg-motion DSL: unknown easing alias "e=${alias}" (known: ${Object.keys(EASING_ALIASES).join(', ')})`,
    );
    /* eslint-enable lingui/no-unlocalized-strings */
  }
  return resolved;
}

/** Applies the DSL's carry-forward rule: a stop that omits a prop keeps the previous stop's value. */
function applyCarryForward(rawStops: readonly RawKeyframeStop[]): readonly CompiledKeyframeStop[] {
  let previous = IDENTITY_TRANSFORM;
  return rawStops.map((stop) => {
    const { assignments } = stop;
    const transform: LoopTransform = {
      tx: assignments.tx ?? previous.tx,
      ty: assignments.ty ?? previous.ty,
      r: assignments.r ?? previous.r,
      sx: assignments.sx ?? assignments.s ?? previous.sx,
      sy: assignments.sy ?? assignments.s ?? previous.sy,
      o: assignments.o ?? previous.o,
    };
    previous = transform;
    return { at: stop.at, transform, easing: resolveEasingAlias(assignments.easingAlias) };
  });
}

/**
 * Strips the design tool's own preview-loop tail (docs/design-system.md §3.1: "Design loops with
 * holds are presentation artefacts: entrances play once"). Every sampled design one-shot that loops
 * for its own infinite CSS preview ends by returning opacity to (at most) the level it started at,
 * after already reaching its full/settled opacity earlier — so the rule is: once opacity reaches its
 * peak for the sequence, drop every stop after the *last* one still at that peak. A sequence with no
 * opacity dip after its peak (including one that never mentions `o` at all, i.e. always opaque) is
 * unaffected.
 */
function stripPreviewLoopTail(
  stops: readonly CompiledKeyframeStop[],
): readonly CompiledKeyframeStop[] {
  const peakOpacity = Math.max(...stops.map((stop) => stop.transform.o));
  let lastIndexAtPeak = 0;
  stops.forEach((stop, index) => {
    if (stop.transform.o === peakOpacity) lastIndexAtPeak = index;
  });
  if (lastIndexAtPeak === stops.length - 1) return stops;
  return stops.slice(0, lastIndexAtPeak + 1);
}

/** Rescales `at` so the (possibly truncated) sequence spans 0 to 1 again. */
function renormalizeTimes(stops: readonly CompiledKeyframeStop[]): readonly CompiledKeyframeStop[] {
  const lastAt = stops[stops.length - 1]?.at;
  if (lastAt === undefined || lastAt === 0 || lastAt === 1) return stops;
  return stops.map((stop) => ({ ...stop, at: stop.at / lastAt }));
}

export interface CompileKeyframesOptions {
  /** Strips the design's preview-loop tail (see `stripPreviewLoopTail`) and renormalizes to 0-1. */
  readonly once?: boolean;
}

/**
 * Compiles one `tg-motion` `kf` attribute string (design/*.dc.html) into fully-resolved,
 * carry-forward-applied stops ready for a pattern to turn into a Reanimated `withSequence`.
 */
export function compileKeyframes(
  kf: string,
  options: CompileKeyframesOptions = {},
): readonly CompiledKeyframeStop[] {
  const resolved = applyCarryForward(parseKeyframes(kf));
  const stops = options.once ? stripPreviewLoopTail(resolved) : resolved;
  return renormalizeTimes(stops);
}
