import type { Canvas } from '@napi-rs/canvas';

import type { BakeFormat } from './manifest';

/**
 * Encodes a rendered canvas to bytes per the manifest target's `format`. `svg`/`vector-drawable`
 * are vector writer outputs (T7's stamp-polygon → VectorDrawable path, T7's app-icon layers) that
 * do not go through this raster encoder — callers must not reach here with those formats.
 */
export async function encodeCanvas(canvas: Canvas, format: BakeFormat): Promise<Uint8Array> {
  if (format === 'png') return canvas.encode('png');
  if (format === 'webp') return canvas.encode('webp');
  throw new Error(`encodeCanvas: "${format}" is not a raster format this encoder produces`);
}
