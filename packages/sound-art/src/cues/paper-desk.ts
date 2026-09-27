import { biquadCoeffs, applyBiquad, BiquadFilter } from '../core/filter';
import { softLimiter } from '../core/effects';
import { pinkNoise, whiteNoise } from '../core/noise';
import { createRng, rngRange } from '../core/prng';
import { createBuffer, mixInto, removeDcOffset } from '../core/signal';

/** Departures digits, split-flap clatter: a short train of filtered clicks with slight pitch variation. */
export function renderFlap(seed: string): Float32Array {
  const rng = createRng(seed);
  const clickCount = 7;
  const clickGap = 0.035;
  const duration = clickCount * clickGap + 0.04;
  const out = createBuffer(duration);
  for (let c = 0; c < clickCount; c += 1) {
    const noise = whiteNoise(0.02, rng);
    const shaped = applyBiquad(noise, biquadCoeffs('bandpass', rngRange(rng, 1400, 2200), 2));
    // A slightly longer decay than a bare click (~7ms vs ~4ms) keeps each flap audible for more of
    // the gap between clicks — a punchier, more present clatter, and less pure silence in the file.
    for (let i = 0; i < shaped.length; i += 1)
      shaped[i] = (shaped[i] ?? 0) * Math.exp(-i / (48000 * 0.007));
    mixInto(out, shaped, 0.5, Math.round(c * clickGap * 48000));
  }
  softLimiter(out, 0.8);
  removeDcOffset(out);
  return out;
}

/** Receipts: mechanical printer whirr — amplitude-modulated filtered noise with occasional ticks. */
export function renderPrinter(seed: string): Float32Array {
  const duration = 0.9;
  const rng = createRng(seed);
  const noise = pinkNoise(duration, rng);
  const shaped = applyBiquad(noise, biquadCoeffs('bandpass', 900, 1.1));
  const out = new Float32Array(shaped.length);
  for (let i = 0; i < shaped.length; i += 1) {
    const t = i / 48000;
    const motorHum = 0.6 + 0.4 * Math.sin(2 * Math.PI * 24 * t);
    const fadeEdge = Math.min(1, Math.min(t, duration - t) / 0.05);
    out[i] = (shaped[i] ?? 0) * motorHum * Math.max(0, fadeEdge) * 0.5;
  }
  const tickCount = 6;
  for (let k = 0; k < tickCount; k += 1) {
    const startSec = rngRange(rng, 0.05, duration - 0.05);
    const tick = whiteNoise(0.01, rng);
    const shapedTick = applyBiquad(tick, biquadCoeffs('bandpass', 3200, 2));
    mixInto(out, shapedTick, 0.25, Math.round(startSec * 48000));
  }
  softLimiter(out, 0.8);
  removeDcOffset(out);
  return out;
}

/** Scan: a rising laser-scanner beep over a light filtered-noise wash. */
export function renderScanner(seed: string): Float32Array {
  const duration = 0.5;
  const rng = createRng(seed);
  const out = createBuffer(duration);
  for (let i = 0; i < out.length; i += 1) {
    const t = i / 48000;
    const progress = t / duration;
    const freq = 500 + progress * 900;
    const env = Math.sin(Math.PI * Math.min(1, progress));
    out[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.5;
  }
  const wash = applyBiquad(whiteNoise(duration, rng), biquadCoeffs('highpass', 4000, 0.7));
  mixInto(out, wash, 0.08);
  softLimiter(out, 0.8);
  removeDcOffset(out);
  return out;
}

/** Photo: a two-click camera shutter (fast open/close mechanical click pair). */
export function renderShutter(seed: string): Float32Array {
  const rng = createRng(seed);
  const duration = 0.09;
  const out = createBuffer(duration);
  // A shorter gap and a slightly longer per-click decay than the original (~4.5ms vs ~2.5ms) keeps
  // more of this very short two-click file audibly "active" rather than silent between the clicks.
  for (const offsetSec of [0, 0.03]) {
    const click = whiteNoise(0.015, rng);
    const shaped = applyBiquad(click, biquadCoeffs('bandpass', 2400, 2.5));
    for (let i = 0; i < shaped.length; i += 1)
      shaped[i] = (shaped[i] ?? 0) * Math.exp(-i / (48000 * 0.0045));
    mixInto(out, shaped, 0.7, Math.round(offsetSec * 48000));
  }
  softLimiter(out, 0.85);
  removeDcOffset(out);
  return out;
}

/** Strokes: a short scratchy pen-on-paper texture (filtered noise, amplitude follows a stroke shape). */
export function renderPen(seed: string): Float32Array {
  const duration = 0.55;
  const rng = createRng(seed);
  const noise = whiteNoise(duration, rng);
  const shaped = applyBiquad(noise, biquadCoeffs('highpass', 2500, 0.9));
  const out = new Float32Array(shaped.length);
  const filter = new BiquadFilter(biquadCoeffs('bandpass', 3000, 1));
  for (let i = 0; i < shaped.length; i += 1) {
    const t = i / 48000;
    const strokeEnv =
      Math.sin(Math.PI * Math.min(1, t / duration)) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 9 * t));
    filter.setCoeffs(biquadCoeffs('bandpass', 2500 + Math.sin(2 * Math.PI * 3 * t) * 500, 1.2));
    out[i] = filter.process(shaped[i] ?? 0) * strokeEnv * 0.3;
  }
  softLimiter(out, 0.75);
  removeDcOffset(out);
  return out;
}

/** Page turn: a paper-rustle swell (filtered noise, quick rise then fall). */
export function renderPage(seed: string): Float32Array {
  const duration = 0.45;
  const rng = createRng(seed);
  const noise = whiteNoise(duration, rng);
  const shaped = applyBiquad(noise, biquadCoeffs('highpass', 1800, 0.8));
  const out = new Float32Array(shaped.length);
  for (let i = 0; i < shaped.length; i += 1) {
    const t = i / 48000;
    const progress = t / duration;
    const env = Math.sin(Math.PI * progress) ** 0.7;
    out[i] = (shaped[i] ?? 0) * env * 0.4;
  }
  softLimiter(out, 0.75);
  removeDcOffset(out);
  return out;
}

/** Feedback sent: a soft paper flick followed by a gentle chime tail. */
export function renderEnvelope(seed: string): Float32Array {
  const duration = 0.5;
  const rng = createRng(seed);
  const flick = whiteNoise(0.05, rng);
  const shapedFlick = applyBiquad(flick, biquadCoeffs('bandpass', 2200, 1.5));
  const out = createBuffer(duration);
  for (let i = 0; i < shapedFlick.length; i += 1)
    shapedFlick[i] = (shapedFlick[i] ?? 0) * Math.exp(-i / (48000 * 0.015));
  mixInto(out, shapedFlick, 0.4);
  for (let i = 0; i < out.length; i += 1) {
    const t = i / 48000 - 0.06;
    if (t < 0) continue;
    const env = Math.exp(-t / 0.22);
    out[i] = (out[i] ?? 0) + Math.sin(2 * Math.PI * 1320 * t) * env * 0.25;
  }
  softLimiter(out, 0.8);
  removeDcOffset(out);
  return out;
}
