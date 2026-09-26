import { resolveKind } from '../kinds/registry';
import type { RenderSpec } from './model';

export interface ArtBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Layout {
  readonly w: number;
  readonly h: number;
  readonly pad: number;
  readonly artBox: ArtBox;
  /** Local (viewBox) units per point — backends multiply by their own device scale for pixels. */
  readonly scale: number;
}

/**
 * Logical (point-space) box for a spec at a given render size, ported from design's
 * `box()`/`setup()` sizing: with a sticker, the 100-unit art occupies `size*100/118` — the sticker
 * pad shrinks the visible art rather than growing the overall box past `sizePt`.
 */
export function layout(spec: RenderSpec, sizePt: number): Layout {
  const { viewBox } = resolveKind(spec.kind);
  const [viewBoxWidth, viewBoxHeight] = viewBox;
  const stickerWidth = spec.sticker?.w ?? 5;
  const pad = spec.sticker ? stickerWidth + 4 : 0;
  const scale = sizePt / (viewBoxWidth + 2 * pad);
  const h = (viewBoxHeight + 2 * pad) * scale;
  const scaledPad = pad * scale;
  return {
    w: sizePt,
    h,
    pad: scaledPad,
    artBox: { x: scaledPad, y: scaledPad, w: viewBoxWidth * scale, h: viewBoxHeight * scale },
    scale,
  };
}
