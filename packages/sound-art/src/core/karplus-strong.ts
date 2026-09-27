import type { Rng } from './prng';
import { SAMPLE_RATE } from './signal';

export interface PluckOptions {
  /** Per-sample feedback decay (closer to 1 = longer sustain). */
  readonly decay?: number;
  /** 0-1: low-pass amount applied inside the feedback loop each cycle (higher = duller/darker). */
  readonly damping?: number;
  readonly sampleRate?: number;
}

/**
 * Classic Karplus-Strong plucked string: a noise-filled delay line of length `sampleRate / freqHz`,
 * fed back through a short averaging (low-pass) filter each cycle. Produces plucked-string timbres
 * (koto, guitar, charango) without any sampled material.
 */
export function renderPluck(
  durationSec: number,
  freqHz: number,
  rng: Rng,
  opts: PluckOptions = {},
): Float32Array {
  const sampleRate = opts.sampleRate ?? SAMPLE_RATE;
  const decay = opts.decay ?? 0.996;
  const damping = Math.min(Math.max(opts.damping ?? 0.5, 0), 1);
  const delayLength = Math.max(2, Math.round(sampleRate / freqHz));
  const ring = new Float32Array(delayLength);
  for (let i = 0; i < delayLength; i += 1) ring[i] = rng() * 2 - 1;

  const n = Math.max(0, Math.round(durationSec * sampleRate));
  const out = new Float32Array(n);
  let writeIdx = 0;
  let prevAveraged = 0;
  for (let i = 0; i < n; i += 1) {
    const readIdx = writeIdx;
    const nextIdx = (readIdx + 1) % delayLength;
    const current = ring[readIdx] ?? 0;
    const next = ring[nextIdx] ?? 0;
    // One-pole low-pass inside the loop (damping) blended with the plain average (brightness knob).
    const averaged = (current + next) / 2;
    const filtered = averaged * (1 - damping) + prevAveraged * damping;
    const value = filtered * decay;
    ring[readIdx] = value;
    prevAveraged = filtered;
    out[i] = current;
    writeIdx = nextIdx;
  }
  return out;
}
