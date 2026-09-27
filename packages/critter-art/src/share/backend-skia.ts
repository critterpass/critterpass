import type {
  SkCanvas,
  SkFont,
  SkImage,
  SkRRect,
  SkRect,
  SkTypeface,
} from '@shopify/react-native-skia';

import { frame } from '../core/frame';
import { layout as coreLayout } from '../core/layout';
import { build } from '../core/model';
import type { SkiaEngine } from '../backends/skia';
import { renderToPicture, toImage, viewportFor } from '../backends/skia';
import type { CardLayout, ImageNode, LayoutNode, RectNode, StickerNode, TextNode } from './model';
import { wrapLines } from './text';

/**
 * The Skia backend's engine needs everything `SkiaEngine` (the sticker renderer's) does, plus text
 * and rounded-rect primitives. `measureText` is its own method (not `SkFont.measureText`) because
 * the test's `canvaskit-wasm` adapter has to synthesize it from glyph widths — `SkFont` itself has
 * no such method in canvaskit — while real Skia can implement it as a one-line call.
 */
export interface ShareSkiaEngine extends SkiaEngine {
  Font(typeface: SkTypeface | null, size: number): SkFont;
  measureText(font: SkFont, text: string): number;
  readonly Typeface: { MakeFreeTypeFaceFromData(bytes: Uint8Array): SkTypeface | null };
  XYWHRect(x: number, y: number, w: number, h: number): SkRect;
  RRectXY(rect: SkRect, rx: number, ry: number): SkRRect;
}

function nodeSize(node: LayoutNode): { readonly w: number; readonly h: number } {
  if (node.type === 'text') return { w: node.w, h: node.lineHeight ?? node.style.fontSize * 1.25 };
  if (node.type === 'sticker') return { w: node.size, h: node.size };
  return { w: node.w, h: node.h };
}

function applyRotation(canvas: SkCanvas, node: LayoutNode): void {
  if (!node.rotationDeg) return;
  const { w, h } = nodeSize(node);
  canvas.rotate(node.rotationDeg, node.x + w / 2, node.y + h / 2);
}

function drawRect(canvas: SkCanvas, node: RectNode, engine: ShareSkiaEngine): void {
  const paint = engine.Paint();
  paint.setAntiAlias(true);
  paint.setColor(engine.Color(node.fill));
  const bounds = engine.XYWHRect(node.x, node.y, node.w, node.h);
  if (node.radius) {
    canvas.drawRRect(engine.RRectXY(bounds, node.radius, node.radius), paint);
  } else {
    canvas.drawRect(bounds, paint);
  }
  if (node.halftone) {
    const dotPaint = engine.Paint();
    dotPaint.setAntiAlias(true);
    dotPaint.setColor(engine.Color('rgba(0,0,0,0.06)'));
    const dotRadius = Math.max(1, node.radius ? node.radius / 8 : 1.5);
    const spacing = dotRadius * 4;
    for (let dy = node.y; dy < node.y + node.h; dy += spacing) {
      for (let dx = node.x; dx < node.x + node.w; dx += spacing) {
        canvas.drawCircle(dx, dy, dotRadius, dotPaint);
      }
    }
  }
}

function drawText(
  canvas: SkCanvas,
  node: TextNode,
  engine: ShareSkiaEngine,
  typefaces: ReadonlyMap<string, SkTypeface>,
): void {
  const typeface = typefaces.get(node.style.fontFamily) ?? null;
  const font = engine.Font(typeface, node.style.fontSize);
  const paint = engine.Paint();
  paint.setAntiAlias(true);
  paint.setColor(engine.Color(node.style.color));
  const measure = (s: string): number => engine.measureText(font, s);
  const lines = wrapLines(node.text, measure, {
    maxWidth: node.w,
    ...(node.maxLines !== undefined ? { maxLines: node.maxLines } : {}),
  });
  const lineHeight = node.lineHeight ?? node.style.fontSize * 1.25;
  lines.forEach((line, index) => {
    const width = measure(line);
    const x =
      node.align === 'center'
        ? node.x + (node.w - width) / 2
        : node.align === 'right'
          ? node.x + node.w - width
          : node.x;
    canvas.drawText(line, x, node.y + (index + 1) * lineHeight - lineHeight * 0.25, paint, font);
  });
}

function drawImage(
  canvas: SkCanvas,
  node: ImageNode,
  engine: ShareSkiaEngine,
  images: ReadonlyMap<string, SkImage>,
): void {
  const key = node.source.uri ?? '';
  const image = images.get(key);
  if (!image) return;
  const paint = engine.Paint();
  paint.setAntiAlias(true);
  const src = engine.XYWHRect(0, 0, image.width(), image.height());
  const dest = engine.XYWHRect(node.x, node.y, node.w, node.h);
  canvas.drawImageRect(image, src, dest, paint);
}

function drawSticker(canvas: SkCanvas, node: StickerNode, engine: ShareSkiaEngine): void {
  const model = build(node.spec, node.size);
  const boxLayout = coreLayout(node.spec, node.size);
  const viewport = viewportFor(boxLayout, 1);
  const picture = renderToPicture(frame(model, 1), viewport, engine);
  canvas.save();
  canvas.translate(node.x, node.y);
  canvas.drawPicture(picture);
  canvas.restore();
}

function drawNode(
  canvas: SkCanvas,
  node: LayoutNode,
  engine: ShareSkiaEngine,
  typefaces: ReadonlyMap<string, SkTypeface>,
  images: ReadonlyMap<string, SkImage>,
): void {
  canvas.save();
  applyRotation(canvas, node);
  switch (node.type) {
    case 'rect':
      drawRect(canvas, node, engine);
      break;
    case 'text':
      drawText(canvas, node, engine, typefaces);
      break;
    case 'image':
      drawImage(canvas, node, engine, images);
      break;
    case 'sticker':
      drawSticker(canvas, node, engine);
      break;
    case 'frame':
      canvas.translate(node.x, node.y);
      for (const child of node.children) drawNode(canvas, child, engine, typefaces, images);
      break;
  }
  canvas.restore();
}

/**
 * Renders a `CardLayout` via the Skia backend, returning a rasterized `SkImage`. `typefaces` and
 * `images` are pre-loaded (`engine.Typeface.MakeFreeTypeFaceFromData` / decoded `SkImage`s) —
 * loading fonts/photos is an async, platform-specific concern the caller owns.
 */
export function renderCardSkia(
  cardLayout: CardLayout,
  engine: ShareSkiaEngine,
  typefaces: ReadonlyMap<string, SkTypeface>,
  images: ReadonlyMap<string, SkImage>,
): SkImage {
  const recorder = engine.PictureRecorder();
  const canvas = recorder.beginRecording();

  const backgroundPaint = engine.Paint();
  backgroundPaint.setColor(engine.Color(cardLayout.background ?? '#ffffff'));
  canvas.drawRect(engine.XYWHRect(0, 0, cardLayout.width, cardLayout.height), backgroundPaint);

  for (const node of cardLayout.nodes) drawNode(canvas, node, engine, typefaces, images);

  const picture = recorder.finishRecordingAsPicture();
  return toImage(engine, picture, cardLayout.width, cardLayout.height);
}
