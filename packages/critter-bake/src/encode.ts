import sharp from 'sharp';

import type { Canvas } from '@napi-rs/canvas';

import type { BakeFormat } from './manifest';

/**
 * Re-encodes PNG bytes losslessly at max zlib compression with adaptive filtering — pixel-identical
 * output (no palette/quantization: that trades real fidelity for size, a founder call this pipeline
 * doesn't make on its own), just a smaller file. `@napi-rs/canvas`'s own PNG encoder leaves real
 * compression on the table (measured on this pipeline's own 8-bit sRGB output: ~55-65% smaller,
 * pixel-identical). This is the one place every `@napi-rs/canvas`-produced PNG should pass through
 * so `--check`'s content hash and every writer (xcassets, Android res, app icon content layers, web
 * critters, the OG atlas) all see the same optimized bytes.
 *
 * `effort` is deliberately omitted, not maxed: measured directly (decode both with
 * `@napi-rs/canvas`, diff raw RGBA) — any explicit `effort` value, even 1, changes real pixel values
 * on content with partial-alpha compositing (max observed delta 6-7/255 per channel), while
 * omitting it (sharp's own default) round-trips exactly. This looks like a real sharp/libvips
 * quirk in its effort-tunable PNG encoder path, not a documented tradeoff — verified empirically on
 * this Mac's installed sharp 0.35.4, not assumed from its docs.
 *
 * Also not used on Xcode's `ictool`-exported flat icon fallbacks (see `writers/app-icon-ios.ts`):
 * those are 16-bit-per-channel PNGs with an embedded (likely Display P3) ICC profile, which
 * `@napi-rs/canvas`'s decoder and sharp's decoder disagree on (independently of this function —
 * confirmed by diffing sharp's own raw decode against `@napi-rs/canvas`'s decode of the same
 * untouched source file), making a "pixel-identical" claim for that file family unverifiable with
 * the tools this pipeline has. Left byte-for-byte as Xcode produced them rather than risk a real,
 * unverifiable colour shift on the app's own App Store icon.
 */
export async function optimizePng(bytes: Uint8Array): Promise<Uint8Array> {
  const optimized = await sharp(bytes)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  return new Uint8Array(optimized);
}

/**
 * Encodes a rendered canvas to bytes per the manifest target's `format`. `svg`/`vector-drawable`
 * are vector writer outputs (the stamp-polygon -> VectorDrawable path, the app-icon layer PNGs
 * writers assemble separately) that do not go through this raster encoder — callers must not reach
 * here with those formats.
 */
export async function encodeCanvas(canvas: Canvas, format: BakeFormat): Promise<Uint8Array> {
  if (format === 'png') return optimizePng(await canvas.encode('png'));
  if (format === 'webp') return canvas.encode('webp');
  throw new Error(`encodeCanvas: "${format}" is not a raster format this encoder produces`);
}
