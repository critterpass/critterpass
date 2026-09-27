import { SAMPLE_RATE } from './signal';

export interface AdsrSpec {
  readonly attackSec: number;
  readonly decaySec: number;
  readonly sustainLevel: number;
  readonly releaseSec: number;
  /** Total voice duration; sustain holds until `durationSec - releaseSec`. */
  readonly durationSec: number;
}

/** ADSR envelope value at time `t` (seconds) into the voice. */
export function adsrValue(spec: AdsrSpec, t: number): number {
  const { attackSec, decaySec, sustainLevel, releaseSec, durationSec } = spec;
  const releaseStart = Math.max(attackSec + decaySec, durationSec - releaseSec);
  if (t < 0) return 0;
  if (t < attackSec) return attackSec === 0 ? 1 : t / attackSec;
  if (t < attackSec + decaySec) {
    const dt = decaySec === 0 ? 1 : (t - attackSec) / decaySec;
    return 1 + (sustainLevel - 1) * dt;
  }
  if (t < releaseStart) return sustainLevel;
  if (t < releaseStart + releaseSec) {
    const dt = releaseSec === 0 ? 1 : (t - releaseStart) / releaseSec;
    return sustainLevel * (1 - dt);
  }
  return 0;
}

/** Applies an ADSR envelope to a buffer in place, one envelope spanning the whole buffer. */
export function applyAdsr(buf: Float32Array, spec: AdsrSpec, sampleRate = SAMPLE_RATE): void {
  for (let i = 0; i < buf.length; i += 1) {
    const t = i / sampleRate;
    buf[i] = (buf[i] ?? 0) * adsrValue(spec, t);
  }
}

/** A `[timeSec, value]` breakpoint envelope, linearly interpolated — for percussive shapes ADSR can't express. */
export type EnvelopePoint = readonly [timeSec: number, value: number];

export function envelopeValueAt(points: readonly EnvelopePoint[], t: number): number {
  if (points.length === 0) return 1;
  const first = points[0];
  if (first === undefined || t <= first[0]) return first?.[1] ?? 1;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev === undefined || curr === undefined) continue;
    if (t <= curr[0]) {
      const span = curr[0] - prev[0];
      const frac = span === 0 ? 1 : (t - prev[0]) / span;
      return prev[1] + (curr[1] - prev[1]) * frac;
    }
  }
  return points[points.length - 1]?.[1] ?? 1;
}

/** Applies a breakpoint envelope to a buffer in place. */
export function applyEnvelopeCurve(
  buf: Float32Array,
  points: readonly EnvelopePoint[],
  sampleRate = SAMPLE_RATE,
): void {
  for (let i = 0; i < buf.length; i += 1) {
    const t = i / sampleRate;
    buf[i] = (buf[i] ?? 0) * envelopeValueAt(points, t);
  }
}

/** Exponential decay curve `exp(-t / timeConstantSec)`, the natural shape for plucks/bells/thuds. */
export function exponentialDecay(t: number, timeConstantSec: number): number {
  if (timeConstantSec <= 0) return t <= 0 ? 1 : 0;
  return Math.exp(-t / timeConstantSec);
}
