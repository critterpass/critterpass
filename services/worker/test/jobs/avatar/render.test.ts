/**
 * `avatar.render`'s drawing: every size is a square PNG with a transparent outside, the ring in
 * its colour at the edge and the photo inside; variant keys are stable media keys per size.
 */
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  RING_COLOURS,
  renderVariant,
  ringWidth,
  variantKey,
} from '../../../src/jobs/avatar/render';

const OWNER = '0192a6f0-1111-7000-8000-000000000001';
const AVATAR = '0192a6f0-2222-7000-8000-000000000002';
const MEDIA_KEY =
  /^u\/[0-9a-f-]{36}\/avatar\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

async function photo(): Promise<Buffer> {
  return sharp({ create: { width: 300, height: 200, channels: 3, background: '#2a9d8f' } })
    .jpeg()
    .toBuffer();
}

async function pixel(png: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return [...data.subarray(at, at + info.channels)];
}

describe('renderVariant', () => {
  it.each([40, 64, 120, 240] as const)('draws a %i px circle with a ring', async (size) => {
    const png = await renderVariant(await photo(), size, RING_COLOURS.epic);
    const meta = await sharp(png).metadata();
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual([
      'png',
      size,
      size,
      true,
    ]);
    expect((await pixel(png, 0, 0))[3]).toBe(0);
    const edge = await pixel(png, Math.floor(size / 2), Math.floor(ringWidth(size) / 2));
    expect(edge.slice(0, 3)).toEqual([0xff, 0x5f, 0xa8]);
    // The photo shows through the disc (JPEG rounding moves a channel by a step or two).
    const centre = await pixel(png, size / 2, size / 2);
    [0x2a, 0x9d, 0x8f, 255].forEach((value, i) => expect(centre[i]).toBeCloseTo(value, -1));
  });
});

describe('variantKey', () => {
  it('is a stable avatar media key per size', () => {
    const key = variantKey(OWNER, AVATAR, 64);
    expect(key).toMatch(MEDIA_KEY);
    expect(key.startsWith(`u/${OWNER}/avatar/`)).toBe(true);
    expect(variantKey(OWNER, AVATAR, 64)).toBe(key);
    expect(new Set([40, 64, 120, 240].map((s) => variantKey(OWNER, AVATAR, s as 40))).size).toBe(4);
  });
});
