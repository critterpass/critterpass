/**
 * Receipt photos shrink before upload, on a real Skia (CanvasKit, the engine the app's Skia is
 * built from): a 12 MP phone photo goes up as a 2000 px JPEG well under the api's 5 MiB, a
 * photographed receipt already small enough goes up byte for byte, and bytes that are not an image
 * go up as they are (the server says what it makes of them).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

import { createCanvas, ImageData } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from '@jest/globals';
import CanvasKitInit from 'canvaskit-wasm';
import type { CanvasKit } from 'canvaskit-wasm';

import { fitWithin, RECEIPT_MAX_EDGE, shrinkReceiptPhoto, type PhotoCodec } from '../receipt-photo';

// canvaskit-wasm's Emscripten glue decodes some strings as utf-16le; jest-expo's TextDecoder
// polyfill only does UTF-8.
Object.assign(globalThis, { TextDecoder, TextEncoder });

const SINGLE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const FIXTURES = path.join(__dirname, '../../../../../modules/cp-ocr/fixtures');

let ck: CanvasKit;

/** JPEG bytes from RGBA pixels (CanvasKit's wasm build ships no JPEG encoder; the app's Skia does). */
function jpegOf(pixels: Uint8Array, width: number, height: number, quality: number): Uint8Array {
  const canvas = createCanvas(width, height);
  canvas
    .getContext('2d')
    .putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  return new Uint8Array(canvas.encodeSync('jpeg', quality));
}

/** The device codec's steps on CanvasKit: decode, draw scaled, read the pixels back. */
function canvasKitCodec(): PhotoCodec {
  return {
    size(bytes) {
      const image = ck.MakeImageFromEncoded(bytes);
      return image === null ? null : { width: image.width(), height: image.height() };
    },
    scaledJpeg(bytes, width, height, quality) {
      const image = ck.MakeImageFromEncoded(bytes);
      const surface = ck.MakeSurface(width, height);
      if (image === null || surface === null) return null;
      surface
        .getCanvas()
        .drawImageRect(
          image,
          ck.XYWHRect(0, 0, image.width(), image.height()),
          ck.XYWHRect(0, 0, width, height),
          new ck.Paint(),
        );
      surface.flush();
      const pixels = surface.makeImageSnapshot().readPixels(0, 0, {
        width,
        height,
        colorType: ck.ColorType.RGBA_8888,
        alphaType: ck.AlphaType.Unpremul,
        colorSpace: ck.ColorSpace.SRGB,
      });
      return pixels === null ? null : jpegOf(new Uint8Array(pixels.buffer), width, height, quality);
    },
  };
}

/**
 * The photo as a phone camera saves it held upright: pixels landscape, EXIF saying "turn 90°"
 * (orientation 6), in an APP1 segment after the JPEG's start marker.
 */
function withOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  const tiff = [
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0,
    0,
    0,
    8,
    0,
    1,
    0x01,
    0x12,
    0,
    3,
    0,
    0,
    0,
    1,
    0,
    orientation,
    0,
    0,
    0,
    0,
    0,
    0,
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const length = payload.length + 2;
  const app1 = [0xff, 0xe1, length >> 8, length & 0xff, ...payload];
  return new Uint8Array([...jpeg.subarray(0, 2), ...app1, ...jpeg.subarray(2)]);
}

/** A 12 MP camera photo (4000 × 3000): the receipt fixture with grain, as a full-quality JPEG. */
function bigPhoto(): Uint8Array {
  const width = 4000;
  const height = 3000;
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const grain = (i * 2654435761) >>> 24;
    pixels[i * 4] = 200 + (grain % 50);
    pixels[i * 4 + 1] = 190 + ((grain >> 2) % 60);
    pixels[i * 4 + 2] = 170 + ((grain >> 4) % 80);
    pixels[i * 4 + 3] = 255;
  }
  return jpegOf(pixels, width, height, 100);
}

beforeAll(async () => {
  const wasmDir = path.dirname(require.resolve('canvaskit-wasm/bin/canvaskit.js'));
  ck = await CanvasKitInit({ locateFile: (file: string) => path.join(wasmDir, file) });
});

describe('a receipt photo before upload', () => {
  it('shrinks a phone-sized photo to a 2000 px JPEG under the upload limit', () => {
    const codec = canvasKitCodec();
    const original = bigPhoto();
    // As a camera saves it, it is too big for one upload.
    expect(original.byteLength).toBeGreaterThan(SINGLE_UPLOAD_MAX_BYTES);
    const shrunk = shrinkReceiptPhoto(original, codec);

    expect(codec.size(shrunk)).toEqual({ width: 2000, height: 1500 });
    expect([...shrunk.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    expect(shrunk.byteLength).toBeLessThan(SINGLE_UPLOAD_MAX_BYTES);
    expect(shrunk.byteLength).toBeLessThan(original.byteLength);
  });

  it('keeps a photo taken upright upright', () => {
    const codec = canvasKitCodec();
    const shrunk = shrinkReceiptPhoto(withOrientation(bigPhoto(), 6), codec);
    expect(codec.size(shrunk)).toEqual({ width: 1500, height: 2000 });
  });

  it('sends a photo already small enough byte for byte', () => {
    const fixture = new Uint8Array(readFileSync(path.join(FIXTURES, 'vi-restaurant-promo.jpg')));
    expect(shrinkReceiptPhoto(fixture, canvasKitCodec())).toBe(fixture);
  });

  it('sends bytes that are not an image as they are', () => {
    const junk = new Uint8Array([1, 2, 3, 4]);
    expect(shrinkReceiptPhoto(junk, canvasKitCodec())).toBe(junk);
  });

  it('keeps the shape and never upscales', () => {
    expect(fitWithin(3024, 4032, RECEIPT_MAX_EDGE)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(1200, 1600, RECEIPT_MAX_EDGE)).toEqual({ width: 1200, height: 1600 });
  });
});
