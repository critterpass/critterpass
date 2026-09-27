import { compress } from '../core/effects';
import { lookaheadLimit } from '../core/limiter';
import { applyGain, dbToLinear, SAMPLE_RATE } from '../core/signal';
import { integratedLufs } from './lufs';
import { normalizeToTruePeak, truePeakDb } from './peak';

export interface CrestReductionOptions {
  /** Compression threshold, expressed relative to `targetLufs` (e.g. `-2` compresses anything
   * louder than roughly 2 dB above target) — relative, not absolute, so it adapts regardless of how
   * quiet or loud the raw, pre-gain material happens to be. */
  readonly thresholdOffsetDb: number;
  readonly ratio: number;
  readonly attackSec: number;
  readonly releaseSec: number;
}

export interface LoudnessMatchOptions {
  readonly targetLufs: number;
  /** A label for what result counts as acceptable — checked after convergence, not used to cut the
   * loop short early (see `CONVERGENCE_EPSILON_LU`); logs a warning (never throws) if still exceeded
   * after the iteration cap, so an out-of-spec render is visible rather than silently shipped. */
  readonly toleranceLu: number;
  readonly ceilingDb: number;
  readonly lookaheadSec?: number;
  readonly releaseSec?: number;
  readonly sampleRate?: number;
  /** Included in the warning message above, e.g. a cue id or guide id. */
  readonly label?: string;
  /** Attenuation-only (forced `makeupDb: 0`, so it can never overshoot) glue compression applied each
   * iteration, after the gain step and before limiting — narrows the gap between a sparse/click-train
   * cue's peaks and its sustained level, so the limiter doesn't have to claw back as much loudness. */
  readonly crestReduction?: CrestReductionOptions;
}

const MAX_ITERATIONS = 8;
// Internal convergence epsilon — deliberately tighter than any caller's `toleranceLu` so the loop
// keeps refining until it is well inside the requested tolerance, not just barely across the line.
const CONVERGENCE_EPSILON_LU = 0.15;
// The look-ahead limiter guards *sample* peaks; true (inter-sample) peaks measured by `truePeakDb`'s
// oversampling can run substantially hotter for this package's synthesised material (noise-heavy
// transients, reverb combs) — empirically up to ~1.1 dB. Aiming the limiter this far under the real
// ceiling keeps the safety net below from ever needing a large corrective cut (which would otherwise
// undo most of the loudness this module just fought to gain back); the net itself is still the
// unconditional guarantee.
const LIMITER_MARGIN_DB = 1.4;

/**
 * Brings `buf` to within `toleranceLu` of `targetLufs`, using a look-ahead limiter (not a single
 * global gain) to hold the true-peak ceiling — so a sparse/transient-heavy arrangement doesn't have
 * to sacrifice its overall level just because a few peaks are hot. Each iteration re-measures
 * loudness after limiting (limiting itself removes a little energy) and applies the remaining
 * correction, converging in a few passes for realistic material. Mutates `buf` in place.
 */
export function matchLoudnessWithLimiter(buf: Float32Array, opts: LoudnessMatchOptions): void {
  const sampleRate = opts.sampleRate ?? SAMPLE_RATE;
  const limiterCeilingDb = opts.ceilingDb - LIMITER_MARGIN_DB;
  const lookaheadSec = opts.lookaheadSec ?? 0.005;
  const releaseSec = opts.releaseSec ?? 0.12;

  if (opts.crestReduction) {
    // A rough one-time gain-up to roughly `targetLufs` first, so the compressor's threshold (set
    // relative to the target) lands somewhere meaningful regardless of how quiet the raw material is,
    // then compress exactly once. Compressing on every loop iteration below would compound: each pass
    // would measure the *already-compressed* level as "too quiet" and boost further, re-triggering
    // compression indefinitely — a runaway spiral, not a convergence.
    applyGain(buf, dbToLinear(opts.targetLufs - integratedLufs(buf, sampleRate)));
    compress(buf, {
      thresholdDb: opts.targetLufs + opts.crestReduction.thresholdOffsetDb,
      ratio: opts.crestReduction.ratio,
      attackSec: opts.crestReduction.attackSec,
      releaseSec: opts.crestReduction.releaseSec,
      makeupDb: 0,
      sampleRate,
    });
  }

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const current = integratedLufs(buf, sampleRate);
    const gainDb = opts.targetLufs - current;
    applyGain(buf, dbToLinear(gainDb));
    lookaheadLimit(buf, {
      ceilingDb: limiterCeilingDb,
      lookaheadSec,
      releaseSec,
      sampleRate,
    });
    // Stop once further iterations wouldn't meaningfully change the result (gain request has settled
    // near zero) — not merely once inside `toleranceLu`, so real material converges as close to the
    // target as it can rather than stopping the moment it first crosses the requested tolerance line.
    if (Math.abs(gainDb) <= CONVERGENCE_EPSILON_LU) break;
  }

  // Unconditional safety net: guarantees the true-peak ceiling even if convergence above didn't fully
  // close the sample-peak/true-peak gap for unusual material (never loosens what the limiter already did).
  if (truePeakDb(buf) > opts.ceilingDb) {
    normalizeToTruePeak(buf, opts.ceilingDb);
  }

  const finalLufs = integratedLufs(buf, sampleRate);
  if (Math.abs(finalLufs - opts.targetLufs) > opts.toleranceLu) {
    const label = opts.label ?? 'audio';
    console.warn(
      `sound-art: ${label} settled at ${finalLufs.toFixed(2)} LUFS, outside +/-${opts.toleranceLu} LU of the ${opts.targetLufs} LUFS target after peak-safe limiting.`,
    );
  }
}
