import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import type { Canvas, SKRSContext2D } from '@napi-rs/canvas';

import { build } from '../core/model';
import { frame } from '../core/frame';
import { layout as coreLayout } from '../core/layout';
import { renderToCanvas, viewportFor } from '../backends/canvas2d';
import type { CanvasFactory, CanvasLike } from '../backends/canvas2d';
import type {
  CardLayout,
  FontAsset,
  FrameNode,
  ImageNode,
  LayoutNode,
  RectNode,
  StickerNode,
  TextNode,
} from './model';
import { wrapLines } from './text';

/** Registers font files with `@napi-rs/canvas`'s global font table under the given family names — call once per process before rendering any card that uses them. */
export function registerFonts(fonts: readonly FontAsset[]): void {
  for (const font of fonts) {
    GlobalFonts.register(Buffer.from(font.bytes), font.family);
  }
}

function fontString(node: TextNode): string {
  const weight = node.style.fontWeight ?? 400;
  return `${weight} ${node.style.fontSize}px "${node.style.fontFamily}"`;
}

function drawRect(ctx: SKRSContext2D, node: RectNode): void {
  ctx.save();
  ctx.fillStyle = node.fill;
  if (node.radius) {
    ctx.beginPath();
    // @napi-rs/canvas implements the standard `roundRect` Canvas2D method.
    ctx.roundRect(node.x, node.y, node.w, node.h, node.radius);
    ctx.fill();
  } else {
    ctx.fillRect(node.x, node.y, node.w, node.h);
  }
  if (node.halftone) {
    const dotRadius = Math.max(1, node.radius ? node.radius / 8 : 1.5);
    const spacing = dotRadius * 4;
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let dy = node.y; dy < node.y + node.h; dy += spacing) {
      for (let dx = node.x; dx < node.x + node.w; dx += spacing) {
        ctx.beginPath();
        ctx.arc(dx, dy, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawText(ctx: SKRSContext2D, node: TextNode): void {
  ctx.save();
  ctx.font = fontString(node);
  ctx.fillStyle = node.style.color;
  ctx.textBaseline = 'alphabetic';
  const measure = (s: string): number => ctx.measureText(s).width;
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
    ctx.fillText(line, x, node.y + (index + 1) * lineHeight - lineHeight * 0.25);
  });
  ctx.restore();
}

async function drawImage(ctx: SKRSContext2D, node: ImageNode): Promise<void> {
  const source = node.source.bytes ?? (node.source.uri ? node.source.uri : undefined);
  if (source === undefined) return;
  const img = await loadImage(source);
  ctx.save();
  if (node.radius) {
    ctx.beginPath();
    ctx.roundRect(node.x, node.y, node.w, node.h, node.radius);
    ctx.clip();
  }
  ctx.drawImage(img, node.x, node.y, node.w, node.h);
  ctx.restore();
}

const nodeCanvasFactory: CanvasFactory = (w, h) => createCanvas(w, h) as unknown as CanvasLike;

function drawSticker(ctx: SKRSContext2D, node: StickerNode): void {
  const model = build(node.spec, node.size);
  const boxLayout = coreLayout(node.spec, node.size);
  const viewport = viewportFor(boxLayout, 1);
  const canvas = renderToCanvas(frame(model, 1), viewport, nodeCanvasFactory) as unknown as Canvas;
  ctx.save();
  ctx.translate(node.x, node.y);
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

function nodeSize(node: LayoutNode): { readonly w: number; readonly h: number } {
  if (node.type === 'text') return { w: node.w, h: node.lineHeight ?? node.style.fontSize * 1.25 };
  if (node.type === 'sticker') return { w: node.size, h: node.size };
  return { w: node.w, h: node.h };
}

async function drawNode(ctx: SKRSContext2D, node: LayoutNode): Promise<void> {
  ctx.save();
  if (node.rotationDeg) {
    const { w, h } = nodeSize(node);
    const cx = node.x + w / 2;
    const cy = node.y + h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((node.rotationDeg * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  switch (node.type) {
    case 'rect':
      drawRect(ctx, node);
      break;
    case 'text':
      drawText(ctx, node);
      break;
    case 'image':
      await drawImage(ctx, node);
      break;
    case 'sticker':
      drawSticker(ctx, node);
      break;
    case 'frame':
      await drawFrame(ctx, node);
      break;
  }
  ctx.restore();
}

async function drawFrame(ctx: SKRSContext2D, node: FrameNode): Promise<void> {
  ctx.save();
  ctx.translate(node.x, node.y);
  for (const child of node.children) await drawNode(ctx, child);
  ctx.restore();
}

/** Renders a `CardLayout` on the server via `@napi-rs/canvas`, returning PNG bytes. */
export async function renderCardNode(cardLayout: CardLayout): Promise<Uint8Array> {
  const canvas = createCanvas(cardLayout.width, cardLayout.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = cardLayout.background ?? '#ffffff';
  ctx.fillRect(0, 0, cardLayout.width, cardLayout.height);
  for (const node of cardLayout.nodes) await drawNode(ctx, node);
  return canvas.encode('png');
}
