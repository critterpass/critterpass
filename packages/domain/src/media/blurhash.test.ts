import { describe, expect, it } from 'vitest';

import { decodeBlurhash, encodeBlurhash, isBlurhash } from './blurhash';

/** A left-to-right gradient from sky blue to sand. */
function gradient(width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = x / (width - 1);
      const at = 4 * (x + y * width);
      out[at] = Math.round(80 + t * 160);
      out[at + 1] = Math.round(160 + t * 50);
      out[at + 2] = Math.round(230 - t * 90);
      out[at + 3] = 255;
    }
  }
  return out;
}

describe('blurhash', () => {
  it('decodes the reference hash of the blurha.sh demo image to its colours', () => {
    const hash = 'LEHV6nWB2yk8pyo0adR*.7kCMdnj';
    expect(isBlurhash(hash)).toBe(true);
    const pixels = decodeBlurhash(hash, 4, 3);
    expect(pixels).toHaveLength(48);
    expect(pixels[3]).toBe(255);
  });

  it('round-trips a gradient closely enough to stand in for it', () => {
    const source = gradient(32, 20);
    const hash = encodeBlurhash(source, 32, 20);
    expect(hash).toHaveLength(4 + 2 * 12);
    const back = decodeBlurhash(hash, 32, 20);
    let error = 0;
    for (let i = 0; i < source.length; i += 1) error += Math.abs((source[i] ?? 0) - (back[i] ?? 0));
    expect(error / source.length).toBeLessThan(8);
  });

  it('encodes a flat colour to a hash that decodes close to that colour', () => {
    const flat = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < flat.length; i += 4) flat.set([255, 204, 0, 255], i);
    const back = decodeBlurhash(encodeBlurhash(flat, 64, 64), 32, 32);
    const centre = 4 * (16 + 16 * 32);
    expect(Math.abs((back[centre + 1] ?? 0) - 204)).toBeLessThan(12);
    expect(back[centre]).toBeGreaterThan(240);
    expect(back[centre + 2]).toBeLessThan(12);
  });

  it('rejects a malformed hash', () => {
    expect(isBlurhash('short')).toBe(false);
    expect(isBlurhash('LEHV6nWB2yk8pyo0adR*.7kCMdn')).toBe(false);
    expect(() => decodeBlurhash('nope!!', 4, 4)).toThrow();
  });
});
