import type { Layout } from '../../core/layout';
import type { RasterViewport } from './render';

export type { Canvas2DContext, CanvasFactory, CanvasLike, RasterViewport } from './render';
export { renderToCanvas } from './render';

/** Converts a logical `layout()` box into pixel-space raster parameters at a real device scale. */
export function viewportFor(boxLayout: Layout, deviceScale: number): RasterViewport {
  return {
    widthPx: Math.round(boxLayout.w * deviceScale),
    heightPx: Math.round(boxLayout.h * deviceScale),
    contentScale: boxLayout.scale * deviceScale,
    padPx: boxLayout.pad * deviceScale,
    deviceScale,
  };
}
