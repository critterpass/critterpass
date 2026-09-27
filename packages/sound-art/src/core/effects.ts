import { dbToLinear, linearToDb, SAMPLE_RATE } from './signal';

/** A feedback delay line mixed with the dry signal — echoes, slap-back, pre-delay for reverb. */
export function delayEffect(
  buf: Float32Array,
  delaySec: number,
  feedback: number,
  mix: number,
  sampleRate = SAMPLE_RATE,
): Float32Array {
  const delaySamples = Math.max(1, Math.round(delaySec * sampleRate));
  const tailSamples = Math.round(delaySamples * 6); // room for feedback to ring out
  const out = new Float32Array(buf.length + tailSamples);
  const line = new Float32Array(buf.length + tailSamples);
  for (let i = 0; i < line.length; i += 1) {
    const dry = buf[i] ?? 0;
    const delayed = i >= delaySamples ? (line[i - delaySamples] ?? 0) : 0;
    const wet = dry + delayed * feedback;
    line[i] = wet;
    out[i] = dry * (1 - mix) + delayed * mix;
  }
  return out;
}

interface CombState {
  readonly buffer: Float32Array;
  writeIdx: number;
}

function createComb(delaySamples: number): CombState {
  return { buffer: new Float32Array(Math.max(1, delaySamples)), writeIdx: 0 };
}

function processComb(state: CombState, x: number, decay: number): number {
  const { buffer } = state;
  const readIdx = state.writeIdx;
  const y = buffer[readIdx] ?? 0;
  buffer[readIdx] = x + y * decay;
  state.writeIdx = (state.writeIdx + 1) % buffer.length;
  return y;
}

function createAllpass(delaySamples: number): CombState {
  return createComb(delaySamples);
}

function processAllpass(state: CombState, x: number, gain: number): number {
  const { buffer } = state;
  const readIdx = state.writeIdx;
  const bufOut = buffer[readIdx] ?? 0;
  const y = -gain * x + bufOut;
  buffer[readIdx] = x + gain * bufOut;
  state.writeIdx = (state.writeIdx + 1) % buffer.length;
  return y;
}

export interface ReverbOptions {
  readonly combDelaysMs?: readonly number[];
  readonly combDecay?: number;
  readonly allpassDelaysMs?: readonly number[];
  readonly allpassGain?: number;
  readonly mix?: number;
  readonly sampleRate?: number;
}

/**
 * A small Schroeder reverb (parallel combs into series allpasses) — a warm, unobtrusive room tail
 * for cues/themes, not a concert-hall simulation. Returns dry+wet, extended with the wet tail.
 */
export function schroederReverb(buf: Float32Array, opts: ReverbOptions = {}): Float32Array {
  const sampleRate = opts.sampleRate ?? SAMPLE_RATE;
  const combDelaysMs = opts.combDelaysMs ?? [29.7, 37.1, 41.1, 43.7];
  const combDecay = opts.combDecay ?? 0.77;
  const allpassDelaysMs = opts.allpassDelaysMs ?? [5, 1.7];
  const allpassGain = opts.allpassGain ?? 0.7;
  const mix = opts.mix ?? 0.25;

  const tailSamples = Math.round(sampleRate * 0.6);
  const combs = combDelaysMs.map((ms) => createComb(Math.round((ms / 1000) * sampleRate)));
  const allpasses = allpassDelaysMs.map((ms) =>
    createAllpass(Math.round((ms / 1000) * sampleRate)),
  );

  const n = buf.length + tailSamples;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const dry = i < buf.length ? (buf[i] ?? 0) : 0;
    let wet = 0;
    for (const comb of combs) wet += processComb(comb, dry, combDecay);
    wet /= combs.length;
    for (const allpass of allpasses) wet = processAllpass(allpass, wet, allpassGain);
    out[i] = dry + wet * mix;
  }
  return out;
}

/** Soft-clip limiter (tanh waveshaper) so hot mixes saturate gently instead of hard-clipping. */
export function softLimiter(buf: Float32Array, ceiling = 0.98): void {
  for (let i = 0; i < buf.length; i += 1) {
    const x = buf[i] ?? 0;
    buf[i] = Math.tanh(x) * ceiling;
  }
}

export interface CompressorOptions {
  readonly thresholdDb: number;
  readonly ratio: number;
  readonly attackSec: number;
  readonly releaseSec: number;
  readonly makeupDb?: number;
  readonly sampleRate?: number;
}

/**
 * A feed-forward bus compressor (linear-domain envelope follower + dB gain curve above `thresholdDb`).
 * With `makeupDb` at its default of 0, this can only ever attenuate (`gainReductionDb <= 0`, so the
 * output is never louder than the input at any sample) — safe to run ahead of a look-ahead limiter as
 * a crest-factor reducer even on transient-heavy material, because there is no amount of envelope lag
 * that can make it overshoot. A non-zero `makeupDb` reintroduces that risk: the envelope has no
 * look-ahead, so a hard, fast attack (a Karplus-Strong pluck's onset, say) can be boosted by the full
 * make-up gain before the detector reacts. `music/render-theme.ts` uses `makeupDb: 0` here purely to
 * narrow the gap between a sparse arrangement's peaks and its sustained level, then lets
 * `loudness/match.ts`'s look-ahead limiter supply the actual loudness make-up afterwards.
 */
export function compress(buf: Float32Array, opts: CompressorOptions): void {
  const sampleRate = opts.sampleRate ?? SAMPLE_RATE;
  const attackCoeff = Math.exp(-1 / (Math.max(opts.attackSec, 1e-4) * sampleRate));
  const releaseCoeff = Math.exp(-1 / (Math.max(opts.releaseSec, 1e-4) * sampleRate));
  const makeupGain = dbToLinear(opts.makeupDb ?? 0);
  // The envelope is smoothed in the LINEAR domain (a standard peak-follower), then converted to dB
  // only for the gain computation. Smoothing raw per-sample dB directly is a trap: a sine's dB value
  // swings from its peak down to -infinity every zero-crossing, and a log-domain average of that is
  // dominated by the deep excursions, not the perceptual level — it under-detects level entirely.
  let envelope = 0;

  for (let i = 0; i < buf.length; i += 1) {
    const x = buf[i] ?? 0;
    const rectified = Math.abs(x);
    const coeff = rectified > envelope ? attackCoeff : releaseCoeff;
    envelope = coeff * envelope + (1 - coeff) * rectified;
    const overDb = linearToDb(envelope) - opts.thresholdDb;
    const gainReductionDb = overDb > 0 ? overDb / opts.ratio - overDb : 0;
    buf[i] = x * dbToLinear(gainReductionDb) * makeupGain;
  }
}
