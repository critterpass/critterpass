/**
 * `tex.hatch` drawn once per block size, colour and density on a CPU raster surface and shown as a
 * plain image. A live Skia canvas per hatched block (every skeleton line, every photo placeholder)
 * is a GL surface of its own on Android, and a loading screen made dozens. One image the size of
 * the block also has no seams to hide, and the stripes sit exactly where the canvas drew them.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a data URI prefix and cache keys, never copy. */
import type * as RNSkiaModule from '@shopify/react-native-skia';

import { UI_QA_ENABLED } from '../qa/ui-qa';
import { stripesPath } from './geometry';

export interface HatchImageInput {
  /** The block, in points. */
  readonly width: number;
  readonly height: number;
  readonly angleDeg: number;
  readonly stripePt: number;
  readonly gapPt: number;
  readonly color: string;
  readonly base: string;
  /** Device pixels per point. */
  readonly scale: number;
}

/** Skeleton blocks come in a few sizes per screen; this many covers a session without growing. */
const MAX_IMAGES = 96;
const images = new Map<string, string | null>();

/** The cache key: block sizes rounded to whole device pixels. */
export function hatchImageKey(input: HatchImageInput): string {
  const w = Math.round(input.width * input.scale);
  const h = Math.round(input.height * input.scale);
  return `${w}x${h}|${input.angleDeg}|${input.stripePt}|${input.gapPt}|${input.color}|${input.base}`;
}

/** The hatched block as a PNG data URI; null where Skia's raster surface is not available. */
export function hatchImage(input: HatchImageInput): string | null {
  const key = hatchImageKey(input);
  const known = images.get(key);
  if (known !== undefined) {
    // Most recently used last, so the oldest is the one dropped.
    images.delete(key);
    images.set(key, known);
    return known;
  }
  let uri: string | null = null;
  const started = UI_QA_ENABLED ? performance.now() : 0;
  try {
    // Loaded here, not at import: the image is optional and Jest suites stand Skia in.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above.
    const { Skia, PaintStyle } = require('@shopify/react-native-skia') as typeof RNSkiaModule;
    const widthPx = Math.max(1, Math.round(input.width * input.scale));
    const heightPx = Math.max(1, Math.round(input.height * input.scale));
    const surface = Skia.Surface.Make(widthPx, heightPx);
    if (surface !== null) {
      const canvas = surface.getCanvas();
      canvas.scale(widthPx / input.width, heightPx / input.height);
      const fill = Skia.Paint();
      fill.setColor(Skia.Color(input.base));
      canvas.drawRect(Skia.XYWHRect(0, 0, input.width, input.height), fill);
      const stroke = Skia.Paint();
      stroke.setColor(Skia.Color(input.color));
      stroke.setStyle(PaintStyle.Stroke);
      stroke.setStrokeWidth(input.stripePt);
      stroke.setAntiAlias(true);
      const path = Skia.Path.MakeFromSVGString(
        stripesPath(input.width, input.height, input.angleDeg, input.stripePt + input.gapPt),
      );
      if (path !== null) canvas.drawPath(path, stroke);
      surface.flush();
      uri = `data:image/png;base64,${surface.makeImageSnapshot().encodeToBase64()}`;
    }
  } catch {
    uri = null;
  }
  if (UI_QA_ENABLED && uri !== null) {
    // Read by the device shards: what drawing new hatched blocks costs the JS thread.
    console.info(`[hatch-encode] ${(performance.now() - started).toFixed(2)}`);
  }
  if (images.size >= MAX_IMAGES) {
    const oldest = images.keys().next().value;
    if (oldest !== undefined) images.delete(oldest);
  }
  images.set(key, uri);
  return uri;
}
