import { SAMPLE_RATE } from './signal';

export type Waveform = 'sine' | 'triangle' | 'saw' | 'square' | 'pulse';

/** A band-unlimited waveform sample at phase `phase01` in `[0, 1)`. Fine for lo-fi cue/theme synthesis
 * at 48 kHz where the harmonic content of short percussive/melodic voices stays well under Nyquist. */
export function oscillatorSample(waveform: Waveform, phase01: number, duty = 0.5): number {
  const p = phase01 - Math.floor(phase01);
  switch (waveform) {
    case 'sine':
      return Math.sin(2 * Math.PI * p);
    case 'triangle':
      return p < 0.5 ? -1 + 4 * p : 3 - 4 * p;
    case 'saw':
      return 2 * p - 1;
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'pulse':
      return p < duty ? 1 : -1;
    default:
      return 0;
  }
}

/**
 * Renders one oscillator voice over `durationSec` with a time-varying frequency (pitch sweeps,
 * vibrato) supplied as `freqAt(t)`. The phase accumulator integrates instantaneous frequency so
 * sweeps stay continuous (no phase jumps).
 */
export function renderOscillator(
  durationSec: number,
  freqAt: (t: number) => number,
  waveform: Waveform = 'sine',
  opts: { sampleRate?: number; dutyAt?: (t: number) => number } = {},
): Float32Array {
  const sampleRate = opts.sampleRate ?? SAMPLE_RATE;
  const n = Math.max(0, Math.round(durationSec * sampleRate));
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRate;
    const duty = opts.dutyAt ? opts.dutyAt(t) : 0.5;
    out[i] = oscillatorSample(waveform, phase, duty);
    phase += freqAt(t) / sampleRate;
  }
  return out;
}

/** A constant-frequency convenience wrapper around `renderOscillator`. */
export function renderTone(
  durationSec: number,
  freqHz: number,
  waveform: Waveform = 'sine',
  sampleRate = SAMPLE_RATE,
): Float32Array {
  return renderOscillator(durationSec, () => freqHz, waveform, { sampleRate });
}

/** A `freqAt(t)` function that sweeps linearly from `startHz` to `endHz` across `durationSec`. */
export function linearSweep(
  startHz: number,
  endHz: number,
  durationSec: number,
): (t: number) => number {
  return (t: number) =>
    durationSec <= 0
      ? startHz
      : startHz + (endHz - startHz) * Math.min(1, Math.max(0, t / durationSec));
}
