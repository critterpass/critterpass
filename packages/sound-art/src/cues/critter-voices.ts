import { biquadCoeffs, applyBiquad } from '../core/filter';
import { softLimiter } from '../core/effects';
import { whiteNoise } from '../core/noise';
import { oscillatorSample } from '../core/oscillator';
import { createRng, rngRange } from '../core/prng';
import { createBuffer, mixInto, removeDcOffset } from '../core/signal';

/** Egg hatch: crack — a short crackling burst of impulsive filtered-noise transients. */
export function renderEggCrack(seed: string): Float32Array {
  const duration = 0.16;
  const rng = createRng(seed);
  const out = createBuffer(duration);
  const crackCount = 5;
  for (let c = 0; c < crackCount; c += 1) {
    const startSec = rngRange(rng, 0, duration - 0.02);
    const burst = whiteNoise(0.015, rng);
    const shaped = applyBiquad(burst, biquadCoeffs('bandpass', rngRange(rng, 1500, 3500), 2.2));
    for (let i = 0; i < shaped.length; i += 1)
      shaped[i] = (shaped[i] ?? 0) * Math.exp(-i / (48000 * 0.003));
    mixInto(out, shaped, 0.6, Math.round(startSec * 48000));
  }
  softLimiter(out, 0.85);
  removeDcOffset(out);
  return out;
}

/** Egg hatch: pop — a resonant cork-pop (fast pitch-up ping through a narrow bandpass). */
export function renderEggPop(seed: string): Float32Array {
  const duration = 0.14;
  const rng = createRng(seed);
  const noise = whiteNoise(0.02, rng);
  const out = createBuffer(duration);
  const filter = biquadCoeffs('bandpass', 500, 4);
  const shaped = applyBiquad(noise, filter);
  for (let i = 0; i < shaped.length; i += 1)
    shaped[i] = (shaped[i] ?? 0) * Math.exp(-i / (48000 * 0.008));
  mixInto(out, shaped, 0.7);

  // A quick upward "pop" ping riding on top.
  for (let i = 0; i < out.length; i += 1) {
    const t = i / 48000;
    const freq = 500 + t * 3000;
    const env = Math.exp(-t / 0.045);
    out[i] = (out[i] ?? 0) + Math.sin(2 * Math.PI * freq * t) * env * 0.5;
  }
  softLimiter(out, 0.85);
  removeDcOffset(out);
  return out;
}

/** Egg hatch: critter chirp — a playful pitch swoop with light vibrato (the creature's own voice). */
export function renderCritterChirp(seed: string): Float32Array {
  const duration = 0.36;
  const rng = createRng(seed);
  const out = createBuffer(duration);
  const baseStart = rngRange(rng, 280, 340);
  const basePeak = rngRange(rng, 780, 920);
  let phase = 0;
  for (let i = 0; i < out.length; i += 1) {
    const t = i / 48000;
    const progress = Math.min(1, t / (duration * 0.6));
    const sweep = baseStart + (basePeak - baseStart) * Math.sin((Math.PI / 2) * progress);
    const vibrato = Math.sin(2 * Math.PI * 14 * t) * 18;
    const freq = sweep + vibrato;
    phase += freq / 48000;
    const env = Math.sin(Math.PI * Math.min(1, t / duration));
    out[i] = oscillatorSample('triangle', phase) * env * 0.7;
  }
  softLimiter(out, 0.85);
  removeDcOffset(out);
  return out;
}
