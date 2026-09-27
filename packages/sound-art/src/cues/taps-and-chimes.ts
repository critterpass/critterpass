import { renderAdditive, withAttack } from '../core/additive';
import { biquadCoeffs, applyBiquad } from '../core/filter';
import { softLimiter } from '../core/effects';
import { whiteNoise } from '../core/noise';
import { renderTone } from '../core/oscillator';
import { createRng } from '../core/prng';
import { applyFade, mixInto, createBuffer, removeDcOffset } from '../core/signal';

/** A very short filtered-noise click (checklist ticks, OTP digits, keypad, odometer roll). */
export function renderTick(seed: string): Float32Array {
  const duration = 0.03;
  const rng = createRng(seed);
  const noise = whiteNoise(duration, rng);
  const shaped = applyBiquad(noise, biquadCoeffs('bandpass', 2600, 1.4));
  for (let i = 0; i < shaped.length; i += 1)
    shaped[i] = (shaped[i] ?? 0) * Math.exp(-i / (48000 * 0.004));
  softLimiter(shaped, 0.8);
  removeDcOffset(shaped);
  return shaped;
}

/** A slightly lower, punchier click than `tick` (slider detents, 15-min snaps, segmented control). */
export function renderSnap(seed: string): Float32Array {
  const duration = 0.045;
  const rng = createRng(seed);
  const noise = whiteNoise(duration, rng);
  const shaped = applyBiquad(noise, biquadCoeffs('bandpass', 1700, 1.6));
  const out = createBuffer(duration);
  const tone = renderTone(duration, 620, 'triangle');
  for (let i = 0; i < out.length; i += 1) {
    const env = Math.exp(-i / (48000 * 0.006));
    out[i] = ((shaped[i] ?? 0) * 0.7 + (tone[i] ?? 0) * 0.3) * env;
  }
  softLimiter(out, 0.8);
  removeDcOffset(out);
  return out;
}

/** A single warm bell strike: additive synthesis with inharmonic partials (metallophone family). */
export function renderBellStrike(
  fundamentalHz: number,
  durationSec: number,
  partialSet: readonly { ratio: number; amplitude: number; decaySec: number }[],
): Float32Array {
  const raw = renderAdditive(durationSec, fundamentalHz, partialSet);
  const attacked = withAttack(raw, 0.004);
  softLimiter(attacked, 0.9);
  removeDcOffset(attacked);
  return attacked;
}

const BELL_PARTIALS = [
  { ratio: 1, amplitude: 1, decaySec: 1.1 },
  { ratio: 2.0, amplitude: 0.55, decaySec: 0.9 },
  { ratio: 2.76, amplitude: 0.35, decaySec: 0.7 },
  { ratio: 3.0, amplitude: 0.25, decaySec: 0.6 },
  { ratio: 4.07, amplitude: 0.18, decaySec: 0.45 },
  { ratio: 5.4, amplitude: 0.1, decaySec: 0.3 },
];

/** Something new needs you: a single light bell tone. */
export function renderBell(): Float32Array {
  return renderBellStrike(880, 1.0, BELL_PARTIALS);
}

/** Valid code, settled, sent: a cheerful short ascending major-triad chime. */
export function renderSuccess(): Float32Array {
  const notes = [660, 880, 1320]; // major triad, root-fifth-octave-ish lift
  const noteDur = 0.14;
  const gap = 0.09;
  const total = gap * (notes.length - 1) + noteDur + 0.05;
  const out = createBuffer(total);
  notes.forEach((freq, i) => {
    const tone = renderBellStrike(freq, noteDur + 0.08, [
      { ratio: 1, amplitude: 1, decaySec: 0.16 },
      { ratio: 2, amplitude: 0.3, decaySec: 0.1 },
      { ratio: 3, amplitude: 0.12, decaySec: 0.08 },
    ]);
    mixInto(out, tone, 0.8, Math.round(i * gap * 48000));
  });
  applyFade(out, 0, Math.round(0.03 * 48000));
  softLimiter(out, 0.9);
  removeDcOffset(out);
  return out;
}
