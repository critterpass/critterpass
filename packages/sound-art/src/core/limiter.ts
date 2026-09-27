import { dbToLinear, SAMPLE_RATE } from './signal';

/** result[i] = min(values[i..i+window-1]), computed in O(n) via a monotonic index deque. */
function slidingWindowMin(values: Float32Array, window: number): Float32Array {
  const n = values.length;
  const result = new Float32Array(n);
  if (n === 0) return result;
  const dequeIdx = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    while (
      tail > head &&
      (values[dequeIdx[tail - 1] as number] as number) >= (values[i] as number)
    ) {
      tail -= 1;
    }
    dequeIdx[tail] = i;
    tail += 1;
    while ((dequeIdx[head] as number) > i + window - 1) head += 1;
    result[i] = values[dequeIdx[head] as number] as number;
  }
  return result;
}

export interface LookaheadLimiterOptions {
  readonly ceilingDb: number;
  readonly lookaheadSec?: number;
  readonly releaseSec?: number;
  readonly sampleRate?: number;
}

/**
 * Per-sample gain curve for a look-ahead brick-wall limiter: `output[i] = input[i] * gain[i]` never
 * exceeds the ceiling, gain reduction begins up to `lookaheadSec` before a peak (a forward sliding-
 * window minimum of the per-sample "gain needed" curve — the offline equivalent of a real-time
 * limiter's look-ahead delay line; no signal delay is needed here since the whole buffer already sits
 * in memory), and gain recovers only at `releaseSec`'s rate so it never snaps back up abruptly.
 *
 * Provably no overs: in both the attack branch (`gain = target`) and the release branch (a convex
 * combination of the previous gain and `target`, capped at `target`), `gain[i] <= minGain[i] <=
 * instGain[i]`, and `instGain[i]` is exactly the factor that brings `|input[i]|` down to the ceiling.
 */
export function computeLookaheadGain(
  input: Float32Array,
  opts: LookaheadLimiterOptions,
): Float32Array {
  const sampleRate = opts.sampleRate ?? SAMPLE_RATE;
  const ceiling = dbToLinear(opts.ceilingDb);
  const lookaheadSamples = Math.max(1, Math.round((opts.lookaheadSec ?? 0.005) * sampleRate));
  const releaseSamples = Math.max(1, (opts.releaseSec ?? 0.12) * sampleRate);
  const releaseCoeff = Math.exp(-1 / releaseSamples);

  const n = input.length;
  const instGain = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const absX = Math.abs(input[i] ?? 0);
    instGain[i] = absX > ceiling ? ceiling / absX : 1;
  }

  const minGain = slidingWindowMin(instGain, lookaheadSamples);
  const gainCurve = new Float32Array(n);
  let gain = 1;
  for (let i = 0; i < n; i += 1) {
    const target = minGain[i] ?? 1;
    if (target < gain) {
      gain = target; // instantaneous attack — safe because minGain already looked ahead
    } else {
      gain = gain + (target - gain) * (1 - releaseCoeff);
      if (gain > target) gain = target; // never exceed what's currently required — no overs, ever
    }
    gainCurve[i] = gain;
  }
  return gainCurve;
}

/** Applies `computeLookaheadGain` to `buf` in place. */
export function lookaheadLimit(buf: Float32Array, opts: LookaheadLimiterOptions): void {
  const gain = computeLookaheadGain(buf, opts);
  for (let i = 0; i < buf.length; i += 1) buf[i] = (buf[i] ?? 0) * (gain[i] ?? 1);
}
