import { biquadCoeffs, applyBiquad } from '../core/filter';
import { softLimiter } from '../core/effects';
import { whiteNoise } from '../core/noise';
import { linearSweep, renderOscillator, renderTone } from '../core/oscillator';
import { createRng } from '../core/prng';
import { createBuffer, mixInto, removeDcOffset } from '../core/signal';

/** Clash, new warning, dietary clash: a soft two-pulse buzz (low sawtooth through a gentle lowpass). */
export function renderWarning(): Float32Array {
  const pulseDur = 0.12;
  const gap = 0.06;
  const total = pulseDur * 2 + gap;
  const out = createBuffer(total);
  for (let p = 0; p < 2; p += 1) {
    const pulse = renderTone(pulseDur, 220, 'saw');
    const shaped = applyBiquad(pulse, biquadCoeffs('lowpass', 900, 0.9));
    for (let i = 0; i < shaped.length; i += 1) {
      const t = i / 48000;
      shaped[i] = (shaped[i] ?? 0) * Math.sin((Math.PI * Math.min(1, t / pulseDur)) ** 0.6);
    }
    mixInto(out, shaped, 0.6, Math.round(p * (pulseDur + gap) * 48000));
  }
  softLimiter(out, 0.8);
  removeDcOffset(out);
  return out;
}

/** Wrong code shake, locked shake, card declined: a dull descending thunk with light distortion. */
export function renderError(): Float32Array {
  const duration = 0.28;
  const tone = renderOscillator(duration, linearSweep(180, 70, duration), 'square');
  const shaped = applyBiquad(tone, biquadCoeffs('lowpass', 500, 0.7));
  for (let i = 0; i < shaped.length; i += 1) {
    const t = i / 48000;
    shaped[i] = Math.tanh((shaped[i] ?? 0) * 1.6) * Math.exp(-t / 0.14);
  }
  softLimiter(shaped, 0.85);
  removeDcOffset(shaped);
  return shaped;
}

/** Ballot, VS punch, +1 float: a quick upward pitch pop with a click transient. */
export function renderVote(seed: string): Float32Array {
  const duration = 0.14;
  const rng = createRng(seed);
  const tone = renderOscillator(duration, linearSweep(320, 920, duration), 'sine');
  for (let i = 0; i < tone.length; i += 1) {
    const t = i / 48000;
    tone[i] = (tone[i] ?? 0) * Math.exp(-t / 0.05);
  }
  const click = whiteNoise(0.01, rng);
  const out = createBuffer(duration);
  mixInto(out, tone, 0.8);
  mixInto(out, applyBiquad(click, biquadCoeffs('bandpass', 3000, 1.2)), 0.4);
  softLimiter(out, 0.85);
  removeDcOffset(out);
  return out;
}

/** Leave-by alarm: three urgent beeps (bypasses quiet hours, so it must read as unmistakably urgent). */
export function renderAlarmGuide(): Float32Array {
  const beepDur = 0.14;
  const gap = 0.1;
  const total = beepDur * 3 + gap * 2 + 0.05;
  const out = createBuffer(total);
  for (let b = 0; b < 3; b += 1) {
    const beep = renderTone(beepDur, 1046.5, 'square'); // C6, cuts through
    const shaped = applyBiquad(beep, biquadCoeffs('bandpass', 1046.5, 3));
    for (let i = 0; i < shaped.length; i += 1) {
      const t = i / 48000;
      const env = Math.sin(Math.PI * Math.min(1, t / beepDur));
      shaped[i] = (shaped[i] ?? 0) * env;
    }
    mixInto(out, shaped, 0.55, Math.round(b * (beepDur + gap) * 48000));
  }
  softLimiter(out, 0.9);
  removeDcOffset(out);
  return out;
}
