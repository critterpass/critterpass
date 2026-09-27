import type { Waveform } from './oscillator';
import { oscillatorSample } from './oscillator';
import { SAMPLE_RATE } from './signal';

export interface FmVoiceSpec {
  readonly carrierFreqAt: (t: number) => number;
  /** Modulator frequency = carrier frequency * modRatio. */
  readonly modRatio: number;
  /** Modulation index (in cycles of phase deviation) over time — drives brightness/growl. */
  readonly modIndexAt: (t: number) => number;
  readonly waveform?: Waveform;
}

/** Two-operator FM synthesis: a sine (or other waveform) carrier phase-modulated by a sine modulator. */
export function renderFm(
  durationSec: number,
  spec: FmVoiceSpec,
  sampleRate = SAMPLE_RATE,
): Float32Array {
  const n = Math.max(0, Math.round(durationSec * sampleRate));
  const out = new Float32Array(n);
  const waveform = spec.waveform ?? 'sine';
  let carrierPhase = 0;
  let modPhase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRate;
    const carrierFreq = spec.carrierFreqAt(t);
    const modFreq = carrierFreq * spec.modRatio;
    const modSample = Math.sin(2 * Math.PI * modPhase);
    const deviation = spec.modIndexAt(t) * modSample;
    out[i] = oscillatorSample(waveform, carrierPhase + deviation);
    carrierPhase += carrierFreq / sampleRate;
    modPhase += modFreq / sampleRate;
  }
  return out;
}
