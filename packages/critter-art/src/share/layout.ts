import type { RenderSpec } from '../core/model';
import type {
  CardLayout,
  FrameNode,
  ImageNode,
  ImageSource,
  LayoutNode,
  RectNode,
  StickerNode,
  TextNode,
  TextRunStyle,
} from './model';

export function card(
  width: number,
  height: number,
  nodes: readonly LayoutNode[],
  background?: string,
): CardLayout {
  return { width, height, nodes, ...(background !== undefined ? { background } : {}) };
}

export interface RectOptions {
  readonly radius?: number;
  readonly halftone?: boolean;
  readonly rotationDeg?: number;
}

export function rect(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  options: RectOptions = {},
): RectNode {
  return { type: 'rect', x, y, w, h, fill, ...options };
}

export interface TextOptions {
  readonly align?: 'left' | 'center' | 'right';
  readonly maxLines?: number;
  readonly lineHeight?: number;
  readonly rotationDeg?: number;
}

export function text(
  x: number,
  y: number,
  w: number,
  value: string,
  style: TextRunStyle,
  options: TextOptions = {},
): TextNode {
  return { type: 'text', x, y, w, text: value, style, ...options };
}

export interface ImageOptions {
  readonly fit?: 'cover' | 'contain';
  readonly radius?: number;
  readonly rotationDeg?: number;
}

export function image(
  x: number,
  y: number,
  w: number,
  h: number,
  source: ImageSource,
  options: ImageOptions = {},
): ImageNode {
  return { type: 'image', x, y, w, h, source, ...options };
}

export interface StickerOptions {
  readonly rotationDeg?: number;
}

export function sticker(
  x: number,
  y: number,
  size: number,
  spec: RenderSpec,
  options: StickerOptions = {},
): StickerNode {
  return { type: 'sticker', x, y, size, spec, ...options };
}

export function frame(
  x: number,
  y: number,
  w: number,
  h: number,
  children: readonly LayoutNode[],
  rotationDeg?: number,
): FrameNode {
  return {
    type: 'frame',
    x,
    y,
    w,
    h,
    children,
    ...(rotationDeg !== undefined ? { rotationDeg } : {}),
  };
}
