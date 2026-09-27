import type { RenderSpec } from '../core/model';

export interface TextRunStyle {
  readonly fontFamily: string;
  readonly fontWeight?: number;
  readonly color: string;
  readonly fontSize: number;
}

export interface TextNode {
  readonly type: 'text';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly text: string;
  readonly style: TextRunStyle;
  readonly align?: 'left' | 'center' | 'right';
  readonly maxLines?: number;
  readonly lineHeight?: number;
  /** "Slightly wrong angles" — a small rotation in degrees around the node's own top-left corner. */
  readonly rotationDeg?: number;
}

export interface RectNode {
  readonly type: 'rect';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fill: string;
  readonly radius?: number;
  /** A repeating dot pattern over the fill, for the recap/postcard halftone texture. */
  readonly halftone?: boolean;
  readonly rotationDeg?: number;
}

/** One local file URI (app) or already-fetched bytes (server, which resolves the signed media URL itself before building the layout). */
export interface ImageSource {
  readonly uri?: string;
  readonly bytes?: Uint8Array;
}

export interface ImageNode {
  readonly type: 'image';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly source: ImageSource;
  readonly fit?: 'cover' | 'contain';
  readonly radius?: number;
  readonly rotationDeg?: number;
}

export interface StickerNode {
  readonly type: 'sticker';
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly spec: RenderSpec;
  readonly rotationDeg?: number;
}

export interface FrameNode {
  readonly type: 'frame';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly children: readonly LayoutNode[];
  readonly rotationDeg?: number;
}

export type LayoutNode = TextNode | RectNode | ImageNode | StickerNode | FrameNode;

export interface CardLayout {
  readonly width: number;
  readonly height: number;
  readonly background?: string;
  readonly nodes: readonly LayoutNode[];
}

/** A font file's bytes plus the family name render code should reference it by. */
export interface FontAsset {
  readonly family: string;
  readonly bytes: Uint8Array;
}
