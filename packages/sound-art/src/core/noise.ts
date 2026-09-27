import type { Rng } from './prng';
import { SAMPLE_RATE } from './signal';

/** White noise, uniform in `[-1, 1)`, seeded by `rng`. */
export function whiteNoise(durationSec: number, rng: Rng, sampleRate = SAMPLE_RATE): Float32Array {
  const n = Math.max(0, Math.round(durationSec * sampleRate));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = rng() * 2 - 1;
  return out;
}

/** Pink noise (~ -3 dB/octave) via the Paul Kellet running-sum approximation, seeded by `rng`. */
export function pinkNoise(durationSec: number, rng: Rng, sampleRate = SAMPLE_RATE): Float32Array {
  const white = whiteNoise(durationSec, rng, sampleRate);
  const out = new Float32Array(white.length);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < white.length; i += 1) {
    const w = white[i] ?? 0;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    out[i] = pink * 0.11; // empirical scale to bring peak back near unity
  }
  return out;
}

/** Brown/red noise via leaky integration of white noise, seeded by `rng`. */
export function brownNoise(durationSec: number, rng: Rng, sampleRate = SAMPLE_RATE): Float32Array {
  const white = whiteNoise(durationSec, rng, sampleRate);
  const out = new Float32Array(white.length);
  let acc = 0;
  const leak = 0.98;
  for (let i = 0; i < white.length; i += 1) {
    acc = leak * acc + (white[i] ?? 0) * 0.05;
    out[i] = acc;
  }
  return out;
}
