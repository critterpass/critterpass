/**
 * Draws the premium tab bar's images into `../navigation/tab-icons/` (@2x and @3x PNGs):
 *
 * - the four tab icons from `design/premium/Tabs.dc.html` (24 grid, 1.9 stroke, round joins), drawn
 *   at 22 pt as template images (the native bar tints them);
 * - Tokek for the guide circle, in colour: 28 pt for the iOS search-role circle, 46 pt for the
 *   Android guide button (the design's doodle size inside the 56 circle).
 *
 * Run after changing a path: `pnpm --filter @cp/mobile exec tsx
 * src/ui/premium/shell/test-support/render-tab-icons.ts --write`. Without `--write` it only checks
 * that every image is in place.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a build script: paths, file names and CLI output. */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCanvas, Path2D, type Canvas } from '@napi-rs/canvas';
import { build, frame, layout, type RenderSpec } from '@cp/critter-art';
import { renderToCanvas, viewportFor, type CanvasFactory } from '@cp/critter-art/canvas2d';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'navigation', 'tab-icons');
const SCALES = [2, 3] as const;
const ICON_PT = 22;
const GRID = 24;
const STROKE = 1.9;

type Shape =
  | { readonly path: string }
  | { readonly rect: readonly [number, number, number, number, number] }
  | { readonly circle: readonly [number, number, number] };

/** Tabs.dc.html, in bar order. */
const TAB_ICONS: Readonly<Record<string, readonly Shape[]>> = {
  home: [{ path: 'M4 10.5 12 4l8 6.5V20h-5v-5.5h-6V20H4z' }],
  trips: [{ path: 'M3.5 7.5h17v3a1.8 1.8 0 0 0 0 3.5v3h-17v-3a1.8 1.8 0 0 0 0-3.5z' }],
  wallet: [{ rect: [3.5, 6, 17, 13, 3] }, { path: 'M3.5 10h17' }],
  pass: [{ rect: [5.5, 3.5, 13, 17, 2.5] }, { circle: [12, 11, 3] }, { path: 'M9.5 16.5h5' }],
};

const GUIDE_IMAGES = { 'guide-tab': 28, 'guide-fab': 46 } as const;
const GUIDE_SPEC: RenderSpec = { kind: 'gecko', seed: 7, sticker: null };

function fileName(name: string, scale: number): string {
  return `${name}@${scale}x.png`;
}

function drawIcon(shapes: readonly Shape[], scale: number): Buffer {
  const px = ICON_PT * scale;
  const canvas = createCanvas(px, px);
  const ctx = canvas.getContext('2d');
  ctx.scale(px / GRID, px / GRID);
  ctx.lineWidth = STROKE;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'black';
  for (const shape of shapes) {
    if ('path' in shape) ctx.stroke(new Path2D(shape.path));
    else if ('rect' in shape) {
      const [x, y, w, h, r] = shape.rect;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.stroke();
    } else {
      const [cx, cy, r] = shape.circle;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return canvas.toBuffer('image/png');
}

const nodeCanvas: CanvasFactory = (width, height) =>
  createCanvas(width, height) as unknown as ReturnType<CanvasFactory>;

function drawGuide(sizePt: number, scale: number): Buffer {
  const model = build(GUIDE_SPEC, sizePt);
  const viewport = viewportFor(layout(GUIDE_SPEC, sizePt), scale);
  const drawn = renderToCanvas(frame(model, 1), viewport, nodeCanvas);
  return (drawn as unknown as Canvas).toBuffer('image/png');
}

function images(): readonly { readonly file: string; readonly draw: () => Buffer }[] {
  return SCALES.flatMap((scale) => [
    ...Object.entries(TAB_ICONS).map(([name, shapes]) => ({
      file: fileName(name, scale),
      draw: () => drawIcon(shapes, scale),
    })),
    ...Object.entries(GUIDE_IMAGES).map(([name, sizePt]) => ({
      file: fileName(name, scale),
      draw: () => drawGuide(sizePt, scale),
    })),
  ]);
}

const write = process.argv.includes('--write');
const missing: string[] = [];
for (const image of images()) {
  const path = join(OUT, image.file);
  if (write) writeFileSync(path, image.draw());
  else if (!existsSync(path)) missing.push(image.file);
}
if (missing.length > 0) {
  console.error(`missing tab images (run with --write): ${missing.join(', ')}`);
  process.exitCode = 1;
}
