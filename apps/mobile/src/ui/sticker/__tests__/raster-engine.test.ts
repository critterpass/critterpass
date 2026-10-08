/**
 * Finished stickers draw on CPU raster surfaces: a sticker drawn through the raster engine asks
 * Skia for `Surface.Make` and never for a GPU offscreen surface, and still comes out as a PNG.
 * Skia's native module is stood in for by a real CanvasKit (WASM Skia) behind the same calls, so a
 * refactor that routes stickers back to GPU surfaces fails here.
 */
jest.unmock('@/ui/sticker/Sticker');

import { beforeAll, describe, expect, it, jest } from '@jest/globals';

import type { SkiaEngine } from '@cp/critter-art/skia';

import { createCanvasKitEngine } from '../../test-support/canvaskit-engine';
import { renderStickerPng } from '../export-png';
import { getRasterSkiaEngine } from '../sticker-runtime';

const mockSurfaces = { raster: 0, gpu: 0 };
let mockEngine: SkiaEngine | undefined;

jest.mock('@shopify/react-native-skia', () => {
  const engine = (): SkiaEngine => {
    if (mockEngine === undefined) throw new Error('CanvasKit not loaded yet');
    return mockEngine;
  };
  return {
    Skia: {
      get Path() {
        return engine().Path;
      },
      Paint: () => engine().Paint(),
      PictureRecorder: () => engine().PictureRecorder(),
      Surface: {
        Make: (width: number, height: number) => {
          mockSurfaces.raster += 1;
          return engine().Surface.MakeOffscreen(width, height);
        },
        MakeOffscreen: () => {
          mockSurfaces.gpu += 1;
          return null;
        },
      },
      get ImageFilter() {
        return engine().ImageFilter;
      },
      Color: (color: string) => engine().Color(color),
      Image: { MakeImageFromEncoded: () => null },
      Data: { fromBytes: (bytes: Uint8Array) => bytes },
    },
  };
});

beforeAll(async () => {
  mockEngine = await createCanvasKitEngine();
}, 60_000);

describe('raster sticker engine', () => {
  it('draws a whole sticker on CPU raster surfaces only, to PNG bytes', () => {
    const bytes = renderStickerPng({ kind: 'gecko', seed: 7 }, 48, 2, getRasterSkiaEngine());
    expect(bytes.byteLength).toBeGreaterThan(100);
    // PNG signature.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(mockSurfaces.raster).toBeGreaterThan(0);
    expect(mockSurfaces.gpu).toBe(0);
  });
});
