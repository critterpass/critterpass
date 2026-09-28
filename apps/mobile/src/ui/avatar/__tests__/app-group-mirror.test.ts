import { beforeAll, describe, expect, it } from '@jest/globals';

import type { SkiaEngine } from '@cp/critter-art/skia';

import { createCanvasKitEngine } from '../../test-support/canvaskit-engine';
import { mirrorPhotoAvatar, mirrorStickerAvatar, SELF_AVATAR_KEY } from '../app-group-mirror';

let engine: SkiaEngine;
beforeAll(async () => {
  engine = await createCanvasKitEngine();
});

describe('App Group avatar mirror', () => {
  it('writes the guide sticker as a PNG under the avatars folder', () => {
    const writes: [string, string][] = [];
    mirrorStickerAvatar('gecko', engine, (key, png) => writes.push([key, png]));
    expect(writes).toHaveLength(1);
    const [key, png] = writes[0]!;
    expect(key).toBe(SELF_AVATAR_KEY);
    expect(Buffer.from(png, 'base64').subarray(1, 4).toString('latin1')).toBe('PNG');
  });

  it('writes a photo avatar from its uploaded bytes', () => {
    const writes: string[] = [];
    mirrorPhotoAvatar(new Uint8Array([137, 80, 78, 71]), (_key, png) => writes.push(png));
    expect(writes).toEqual(['iVBORw==']);
  });
});
