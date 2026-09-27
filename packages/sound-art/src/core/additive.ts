import { SAMPLE_RATE } from './signal';

export interface Partial {
  /** Frequency ratio relative to the fundamental; non-integer ratios give bell/metallophone inharmonicity. */
  readonly ratio: number;
  readonly amplitude: number;
  /** Exponential decay time constant in seconds for this partial. */
  readonly decaySec: number;
  /** Optional per-partial phase offset in turns (0-1); default 0. */
  readonly phase?: number;
}

/**
 * Additive synthesis: sums independently-decaying sine partials over a fundamental. Used for bells,
 * metallophones (gamelan/marimba) and other pitched-percussion timbres where a struck bar/plate's
 * partials are not simple integer multiples of the fundamental.
 */
export function renderAdditive(
  durationSec: number,
  fundamentalHz: number,
  partials: readonly Partial[],
  sampleRate = SAMPLE_RATE,
): Float32Array {
  const n = Math.max(0, Math.round(durationSec * sampleRate));
  const out = new Float32Array(n);
  for (const partial of partials) {
    const freq = fundamentalHz * partial.ratio;
    const phaseOffset = partial.phase ?? 0;
    for (let i = 0; i < n; i += 1) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t / Math.max(partial.decaySec, 1e-6));
      out[i] =
        (out[i] ?? 0) +
        partial.amplitude * envelope * Math.sin(2 * Math.PI * (freq * t + phaseOffset));
    }
  }
  return out;
}

/** A gentle attack ramp (avoids a click at t=0) applied on top of `renderAdditive`'s natural decay. */
export function withAttack(
  buf: Float32Array,
  attackSec: number,
  sampleRate = SAMPLE_RATE,
): Float32Array {
  const attackSamples = Math.max(1, Math.round(attackSec * sampleRate));
  const out = Float32Array.from(buf);
  for (let i = 0; i < Math.min(attackSamples, out.length); i += 1) {
    out[i] = (out[i] ?? 0) * (i / attackSamples);
  }
  return out;
}
