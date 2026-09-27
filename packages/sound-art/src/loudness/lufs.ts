import type { BiquadCoeffs } from '../core/filter';
import { applyBiquadCascade } from '../core/filter';
import { SAMPLE_RATE } from '../core/signal';

/**
 * ITU-R BS.1770-4 K-weighting pre-filter, standard coefficients for 48 kHz (stage 1: a high shelf
 * modelling head diffraction; stage 2: a high-pass modelling the outer/middle ear's low-frequency
 * roll-off). Fixed to 48 kHz since that is this package's only sample rate.
 */
const K_WEIGHTING_48K: readonly BiquadCoeffs[] = [
  {
    b0: 1.53512485958697,
    b1: -2.69169618940638,
    b2: 1.19839281085285,
    a1: -1.69065929318241,
    a2: 0.73248077421585,
  },
  {
    b0: 1.0,
    b1: -2.0,
    b2: 1.0,
    a1: -1.99004745483398,
    a2: 0.99007225036621,
  },
];

const BLOCK_SEC = 0.4;
const HOP_SEC = 0.1; // 75% overlap, per BS.1770/EBU R128
const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_OFFSET_LUFS = -10;

function blockLoudness(meanSquare: number): number {
  return -0.691 + 10 * Math.log10(Math.max(meanSquare, 1e-12));
}

/**
 * Integrated loudness in LUFS for a mono buffer, following BS.1770's K-weighting + 400 ms gated
 * blocks + absolute (-70 LUFS) then relative (-10 LU below the ungated mean) gating. Mono-only (no
 * channel weighting needed), matching this package's mono synthesis.
 */
export function integratedLufs(buf: Float32Array, sampleRate = SAMPLE_RATE): number {
  if (buf.length === 0) return -Infinity;
  const weighted = applyBiquadCascade(buf, K_WEIGHTING_48K);
  const blockSamples = Math.round(BLOCK_SEC * sampleRate);
  const hopSamples = Math.round(HOP_SEC * sampleRate);
  if (weighted.length < blockSamples) {
    let sum = 0;
    for (const v of weighted) sum += v * v;
    return blockLoudness(sum / weighted.length);
  }

  const blockLoudnesses: number[] = [];
  for (let start = 0; start + blockSamples <= weighted.length; start += hopSamples) {
    let sum = 0;
    for (let i = start; i < start + blockSamples; i += 1) {
      const v = weighted[i] ?? 0;
      sum += v * v;
    }
    blockLoudnesses.push(blockLoudness(sum / blockSamples));
  }

  const absoluteGated = blockLoudnesses.filter((l) => l > ABSOLUTE_GATE_LUFS);
  if (absoluteGated.length === 0) return ABSOLUTE_GATE_LUFS;
  const ungatedMean = absoluteGated.reduce((a, b) => a + b, 0) / absoluteGated.length;
  const relativeGate = ungatedMean + RELATIVE_GATE_OFFSET_LUFS;
  const gated = absoluteGated.filter((l) => l > relativeGate);
  const finalSet = gated.length > 0 ? gated : absoluteGated;
  return finalSet.reduce((a, b) => a + b, 0) / finalSet.length;
}

/** Scales `buf` in place so its integrated loudness hits `targetLufs`; returns the applied gain in dB. */
export function normalizeToLufs(
  buf: Float32Array,
  targetLufs: number,
  sampleRate = SAMPLE_RATE,
): number {
  const current = integratedLufs(buf, sampleRate);
  const gainDb = targetLufs - current;
  const gain = Math.pow(10, gainDb / 20);
  for (let i = 0; i < buf.length; i += 1) buf[i] = (buf[i] ?? 0) * gain;
  return gainDb;
}
