/**
 * A doodle icon drawn once per (name, size, colours, density, direction) on a CPU raster surface
 * and shown as a plain image. A live Skia canvas per icon is a GL surface of its own on Android,
 * and icons were most of the surfaces left on a screen (tab bar, buttons, rows). Icons don't
 * animate, so the image is the same picture the canvas drew; a new colour (theme, pressed state,
 * surface tone) is a new key and a new image, never a stale one.
 *
 * Drawing a new icon is never done while a screen renders: the icon shows live for its first
 * frames while the picture is drawn in a later task, one icon per task, and then swaps to it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a data URI prefix and cache keys, never copy. */
import type * as RNSkiaModule from '@shopify/react-native-skia';

import { UI_QA_ENABLED } from '../qa/ui-qa';
import type { DoodleLayer } from './types';

export interface IconImageInput {
  readonly name: string;
  readonly layers: readonly DoodleLayer[];
  /** Each layer's resolved fill (undefined: the layer is not drawn). */
  readonly fills: readonly (string | undefined)[];
  /** The doodle's own view box width; the drawing scales from it. */
  readonly viewBoxWidth: number;
  /** The icon in points. */
  readonly width: number;
  readonly height: number;
  readonly mirror: boolean;
  /** Device pixels per point. */
  readonly scale: number;
}

const MAX_IMAGES = 400;
const images = new Map<string, string | null>();

export function iconImageKey(input: IconImageInput): string {
  const w = Math.round(input.width * input.scale);
  const h = Math.round(input.height * input.scale);
  return `${input.name}|${w}x${h}|${input.fills.join(',')}|${input.mirror ? 'rtl' : 'ltr'}`;
}

/**
 * The icon's picture if it has been drawn: a data URI, null where Skia's raster surface is not
 * available, undefined when it has not been drawn yet.
 */
export function cachedIconImage(input: IconImageInput): string | null | undefined {
  const key = iconImageKey(input);
  const known = images.get(key);
  if (known !== undefined) {
    images.delete(key);
    images.set(key, known);
  }
  return known;
}

const queue = new Map<string, { input: IconImageInput; ready: Set<() => void> }>();
let draining = false;

function drainOne(): void {
  const next = queue.entries().next();
  if (next.done === true) {
    draining = false;
    return;
  }
  const [key, job] = next.value;
  queue.delete(key);
  iconImage(job.input);
  for (const ready of job.ready) ready();
  setTimeout(drainOne, 0);
}

/**
 * Draws the icon's picture in a later task (one icon per task, so a screen's new icons never land
 * in one frame) and calls `ready` once it is cached; returns a cancel for an unmounted icon.
 */
export function requestIconImage(input: IconImageInput, ready: () => void): () => void {
  const key = iconImageKey(input);
  const job = queue.get(key) ?? { input, ready: new Set<() => void>() };
  job.ready.add(ready);
  queue.set(key, job);
  if (!draining) {
    draining = true;
    setTimeout(drainOne, 0);
  }
  return () => {
    job.ready.delete(ready);
  };
}

/** Draws (or reuses) the icon's picture now: a data URI, or null without a raster surface. */
export function iconImage(input: IconImageInput): string | null {
  const key = iconImageKey(input);
  const known = images.get(key);
  if (known !== undefined) return known;
  let uri: string | null = null;
  const started = UI_QA_ENABLED ? performance.now() : 0;
  try {
    // Loaded here, not at import: the image is optional and Jest suites stand Skia in.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- see above.
    const { Skia, BlendMode } = require('@shopify/react-native-skia') as typeof RNSkiaModule;
    const widthPx = Math.max(1, Math.round(input.width * input.scale));
    const heightPx = Math.max(1, Math.round(input.height * input.scale));
    const surface = Skia.Surface.Make(widthPx, heightPx);
    if (surface !== null) {
      const canvas = surface.getCanvas();
      const toPx = widthPx / input.viewBoxWidth;
      if (input.mirror) {
        canvas.translate(widthPx, 0);
        canvas.scale(-toPx, toPx);
      } else {
        canvas.scale(toPx, toPx);
      }
      input.layers.forEach((layer, index) => {
        const fill = input.fills[index];
        if (fill === undefined) return;
        const path = Skia.Path.MakeFromSVGString(layer.d);
        if (path === null) return;
        const paint = Skia.Paint();
        paint.setColor(Skia.Color(fill));
        paint.setAlphaf(paint.getAlphaf() * (layer.opacity ?? 1));
        paint.setAntiAlias(true);
        if (layer.multiply) paint.setBlendMode(BlendMode.Multiply);
        canvas.drawPath(path, paint);
      });
      surface.flush();
      uri = `data:image/png;base64,${surface.makeImageSnapshot().encodeToBase64()}`;
    }
  } catch {
    uri = null;
  }
  if (UI_QA_ENABLED && uri !== null) {
    // Read by the device shards (skia-surfaces/<flow>.json): what drawing new icons costs the JS
    // thread on a real screen.
    console.info(`[icon-encode] ${(performance.now() - started).toFixed(2)}`);
  }
  if (images.size >= MAX_IMAGES) {
    const oldest = images.keys().next().value;
    if (oldest !== undefined) images.delete(oldest);
  }
  images.set(key, uri);
  return uri;
}
