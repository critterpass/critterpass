import { createHash } from 'node:crypto';

/**
 * A stable content hash of PCM samples, quantised to 16-bit integers first so the hash is immune to
 * the last-bit float noise that can differ across JS engines/CPUs, while still catching any real
 * change to the synthesised audio. This is what the bake `--check` mode compares — never the encoded
 * file bytes, which vary by ffmpeg version/build.
 */
export function hashPcm(buf: Float32Array): string {
  const ints = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, buf[i] ?? 0));
    ints[i] = Math.round(clamped * 32767);
  }
  const bytes = Buffer.from(ints.buffer, ints.byteOffset, ints.byteLength);
  return createHash('sha256').update(bytes).digest('hex');
}
