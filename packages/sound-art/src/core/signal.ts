/** Shared Float32 PCM buffer utilities. Every synthesis module renders mono Float32 at this rate. */
export const SAMPLE_RATE = 48000;

/** Allocates a silent mono buffer of the given duration. */
export function createBuffer(durationSec: number, sampleRate = SAMPLE_RATE): Float32Array {
  return new Float32Array(Math.max(0, Math.round(durationSec * sampleRate)));
}

/** Mixes `src` into `dest` at `gain`, starting at `offsetSamples`; out-of-range samples are dropped. */
export function mixInto(dest: Float32Array, src: Float32Array, gain = 1, offsetSamples = 0): void {
  for (let i = 0; i < src.length; i += 1) {
    const j = offsetSamples + i;
    if (j < 0 || j >= dest.length) continue;
    dest[j] = (dest[j] ?? 0) + (src[i] ?? 0) * gain;
  }
}

/** Scales a buffer in place by a linear gain factor. */
export function applyGain(buf: Float32Array, gain: number): void {
  for (let i = 0; i < buf.length; i += 1) buf[i] = (buf[i] ?? 0) * gain;
}

/** Linear fade-in/fade-out at the edges, in samples. */
export function applyFade(buf: Float32Array, fadeInSamples: number, fadeOutSamples: number): void {
  const fadeIn = Math.min(fadeInSamples, buf.length);
  const fadeOut = Math.min(fadeOutSamples, buf.length);
  for (let i = 0; i < fadeIn; i += 1) buf[i] = (buf[i] ?? 0) * (i / fadeIn);
  for (let i = 0; i < fadeOut; i += 1) {
    const idx = buf.length - 1 - i;
    buf[idx] = (buf[idx] ?? 0) * (i / fadeOut);
  }
}

/** Largest absolute sample value (sample-peak, not true-peak — see `loudness/peak.ts`). */
export function peakAbs(buf: Float32Array): number {
  let peak = 0;
  for (const value of buf) peak = Math.max(peak, Math.abs(value));
  return peak;
}

/** Mean sample value (DC offset). */
export function dcOffset(buf: Float32Array): number {
  if (buf.length === 0) return 0;
  let sum = 0;
  for (const value of buf) sum += value;
  return sum / buf.length;
}

/** Removes DC offset in place by subtracting the mean. */
export function removeDcOffset(buf: Float32Array): void {
  const offset = dcOffset(buf);
  if (offset === 0) return;
  for (let i = 0; i < buf.length; i += 1) buf[i] = (buf[i] ?? 0) - offset;
}

/** Concatenates buffers into one new buffer. */
export function concat(buffers: readonly Float32Array[]): Float32Array {
  const total = buffers.reduce((sum, b) => sum + b.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

/** Returns a buffer of exactly `length` samples, truncating or zero-padding as needed. */
export function trimOrPad(buf: Float32Array, length: number): Float32Array {
  if (buf.length === length) return buf;
  const out = new Float32Array(length);
  out.set(buf.subarray(0, Math.min(buf.length, length)));
  return out;
}

/** Converts a decibel value to a linear amplitude multiplier. */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/** Converts a linear amplitude multiplier to decibels (silence maps to a very low floor, not -Infinity). */
export function linearToDb(linear: number): number {
  return 20 * Math.log10(Math.max(Math.abs(linear), 1e-12));
}
