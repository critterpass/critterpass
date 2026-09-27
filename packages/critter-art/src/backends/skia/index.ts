import type { Layout } from '../../core/layout';
import type { RasterViewport } from './render';

export type { PathFactoryLike, Transform2D } from './paths';
export { IDENTITY_TRANSFORM, pathFromPoints } from './paths';
export type { RasterViewport, SkiaEngine } from './render';
export { renderToPicture, toImage } from './render';

/** Converts a logical `layout()` box into pixel-space raster parameters at a real device scale — identical contract to the canvas2d backend's `viewportFor`, so both backends read the same `Layout`. */
export function viewportFor(boxLayout: Layout, deviceScale: number): RasterViewport {
  return {
    widthPx: Math.round(boxLayout.w * deviceScale),
    heightPx: Math.round(boxLayout.h * deviceScale),
    contentScale: boxLayout.scale * deviceScale,
    padPx: boxLayout.pad * deviceScale,
    deviceScale,
  };
}
