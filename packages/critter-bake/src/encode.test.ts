import { createCanvas, loadImage } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';

import { optimizePng } from './encode';

/** A real, non-trivial PNG (gradient + shapes + alpha), not a 1x1 pixel — small enough for a fast test, varied enough that a real compression pass has something to do. */
async function samplePng(): Promise<Uint8Array> {
  const size = 96;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#ffd84a');
  gradient.addColorStop(1, '#17142a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,95,168,0.6)';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.clearRect(0, 0, size / 4, size / 4);
  return canvas.encode('png');
}

async function decodeRgba(
  png: Uint8Array,
): Promise<{ width: number; height: number; data: Buffer }> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, image.width, image.height);
  return { width, height, data: Buffer.from(data.buffer, data.byteOffset, data.byteLength) };
}

describe('optimizePng', () => {
  it('produces a smaller file with pixel-identical RGBA content', async () => {
    const original = await samplePng();
    const optimized = await optimizePng(original);

    expect(optimized.byteLength).toBeLessThan(original.byteLength);

    const [before, after] = await Promise.all([decodeRgba(original), decodeRgba(optimized)]);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(after.data.equals(before.data)).toBe(true);
  });

  it('is idempotent (re-optimizing already-optimized bytes changes nothing but framing overhead)', async () => {
    const original = await samplePng();
    const once = await optimizePng(original);
    const twice = await optimizePng(once);

    const [a, b] = await Promise.all([decodeRgba(once), decodeRgba(twice)]);
    expect(b.data.equals(a.data)).toBe(true);
  });
});
