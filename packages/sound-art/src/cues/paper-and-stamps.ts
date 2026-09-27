import { BiquadFilter, biquadCoeffs, applyBiquad } from '../core/filter';
import { softLimiter } from '../core/effects';
import { adsrValue } from '../core/envelope';
import { whiteNoise } from '../core/noise';
import { linearSweep, renderOscillator } from '../core/oscillator';
import { createRng } from '../core/prng';
import { createBuffer, mixInto, removeDcOffset } from '../core/signal';

/** Stamp slam: a low thumping body plus a short paper-slap noise transient. Shared by heavy/soft. */
function renderThud(
  seed: string,
  bodyFreq: number,
  bodyDecay: number,
  noiseAmount: number,
): Float32Array {
  const duration = 0.22;
  const rng = createRng(seed);
  const out = createBuffer(duration);

  const body = renderOscillator(duration, linearSweep(bodyFreq, bodyFreq * 0.6, duration), 'sine');
  for (let i = 0; i < body.length; i += 1) {
    const t = i / 48000;
    body[i] = (body[i] ?? 0) * Math.exp(-t / bodyDecay);
  }
  mixInto(out, body, 0.9);

  const noise = whiteNoise(0.03, rng);
  const shaped = applyBiquad(noise, biquadCoeffs('bandpass', 1200, 0.8));
  for (let i = 0; i < shaped.length; i += 1)
    shaped[i] = (shaped[i] ?? 0) * Math.exp(-i / (48000 * 0.006));
  mixInto(out, shaped, noiseAmount);

  softLimiter(out, 0.95);
  removeDcOffset(out);
  return out;
}

export function renderThudHeavy(seed: string): Float32Array {
  return renderThud(seed, 95, 0.09, 0.5);
}

export function renderThudSoft(seed: string): Float32Array {
  return renderThud(seed, 150, 0.06, 0.3);
}

/** Sticker slap-in: a bright, very short filtered noise ping. */
export function renderSlap(seed: string): Float32Array {
  const duration = 0.1;
  const rng = createRng(seed);
  const noise = whiteNoise(duration, rng);
  const shaped = applyBiquad(noise, biquadCoeffs('bandpass', 1800, 1.1));
  for (let i = 0; i < shaped.length; i += 1) {
    const t = i / 48000;
    shaped[i] = (shaped[i] ?? 0) * Math.exp(-t / 0.018);
  }
  softLimiter(shaped, 0.9);
  removeDcOffset(shaped);
  return shaped;
}

/** Rip/peel: a rising-then-falling bandpass sweep over filtered noise (paper peel, label removal). */
export function renderPeel(seed: string): Float32Array {
  const duration = 0.24;
  const rng = createRng(seed);
  const noise = whiteNoise(duration, rng);
  const out = new Float32Array(noise.length);
  const filter = new BiquadFilter(biquadCoeffs('bandpass', 700, 1.6));
  const envelopeSpec = {
    attackSec: 0.01,
    decaySec: duration - 0.06,
    sustainLevel: 0.2,
    releaseSec: 0.05,
    durationSec: duration,
  };
  for (let i = 0; i < noise.length; i += 1) {
    const t = i / 48000;
    const progress = t / duration;
    const centre = progress < 0.5 ? 700 + progress * 2600 : 2000 - (progress - 0.5) * 2000;
    filter.setCoeffs(biquadCoeffs('bandpass', Math.max(200, centre), 1.6));
    out[i] = filter.process(noise[i] ?? 0) * adsrValue(envelopeSpec, t);
  }
  softLimiter(out, 0.85);
  removeDcOffset(out);
  return out;
}

/** Whoosh: a filtered-noise sweep with no attack transient (fling, fly-to, paper plane). */
export function renderWhoosh(seed: string): Float32Array {
  const duration = 0.35;
  const rng = createRng(seed);
  const noise = whiteNoise(duration, rng);
  const out = new Float32Array(noise.length);
  const filter = new BiquadFilter(biquadCoeffs('bandpass', 250, 1.2));
  for (let i = 0; i < noise.length; i += 1) {
    const t = i / 48000;
    const progress = t / duration;
    // Rises then falls: 250 Hz -> 2200 Hz -> 500 Hz.
    const centre =
      progress < 0.55 ? 250 + (progress / 0.55) * 1950 : 2200 - ((progress - 0.55) / 0.45) * 1700;
    filter.setCoeffs(biquadCoeffs('bandpass', centre, 1.2));
    const envelope = Math.sin(Math.PI * Math.min(1, progress));
    out[i] = filter.process(noise[i] ?? 0) * envelope;
  }
  softLimiter(out, 0.85);
  removeDcOffset(out);
  return out;
}
