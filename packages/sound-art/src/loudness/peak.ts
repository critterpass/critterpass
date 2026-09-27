import { linearToDb } from '../core/signal';

/** Cubic Hermite interpolation between the 4 samples surrounding position `mu` in `[0, 1)` between y1,y2. */
function cubicHermite(y0: number, y1: number, y2: number, y3: number, mu: number): number {
  const a = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
  const b = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c = -0.5 * y0 + 0.5 * y2;
  const d = y1;
  return ((a * mu + b) * mu + c) * mu + d;
}

/**
 * True-peak estimate in dBTP: reconstructs the analogue waveform at `oversample`x resolution with
 * cubic interpolation (a practical approximation of the ITU-R BS.1770 true-peak meter's polyphase
 * resampler, without pulling in a resampling library) and takes the peak of the oversampled signal.
 * Inter-sample peaks that a plain sample-peak reading would miss are what this catches.
 */
export function truePeakDb(buf: Float32Array, oversample = 8): number {
  let maxAbs = 0;
  for (let i = 0; i < buf.length; i += 1) {
    maxAbs = Math.max(maxAbs, Math.abs(buf[i] ?? 0));
  }
  for (let i = -1; i < buf.length; i += 1) {
    const y0 = buf[i - 1] ?? buf[0] ?? 0;
    const y1 = buf[i] ?? buf[0] ?? 0;
    const y2 = buf[i + 1] ?? buf[buf.length - 1] ?? 0;
    const y3 = buf[i + 2] ?? buf[buf.length - 1] ?? 0;
    for (let k = 1; k < oversample; k += 1) {
      const mu = k / oversample;
      const v = Math.abs(cubicHermite(y0, y1, y2, y3, mu));
      if (v > maxAbs) maxAbs = v;
    }
  }
  return linearToDb(maxAbs);
}

/** Scales `buf` in place so its true peak hits `targetDb`; returns the applied gain in dB. */
export function normalizeToTruePeak(buf: Float32Array, targetDb: number): number {
  const current = truePeakDb(buf);
  const gainDb = targetDb - current;
  const gain = Math.pow(10, gainDb / 20);
  for (let i = 0; i < buf.length; i += 1) buf[i] = (buf[i] ?? 0) * gain;
  return gainDb;
}
