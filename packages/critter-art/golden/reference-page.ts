// Bundled by esbuild and loaded in the browser (see harness.html / run-golden.ts): the same
// `@cp/critter-art` core and Canvas2D backend the app and Node bake pipeline use, driven with an
// injected `document.createElement('canvas')` factory.
import { renderToCanvas, viewportFor } from '../src/backends/canvas2d/index';
import { layout } from '../src/core/layout';
import type { RenderSpec } from '../src/core/model';
import { build } from '../src/core/model';
import { frame } from '../src/core/frame';
import type { CanvasFactory, CanvasLike } from '../src/backends/canvas2d/render';

const browserCanvasFactory: CanvasFactory = (width, height): CanvasLike => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas as unknown as CanvasLike;
};

/** Renders one spec at one draw-on progress, returning a `data:image/png;base64,...` URL. */
function renderCore(spec: RenderSpec, sizePt: number, p: number, deviceScale: number): string {
  const model = build(spec, sizePt);
  const boxLayout = layout(spec, sizePt);
  const viewport = viewportFor(boxLayout, deviceScale);
  const canvas = renderToCanvas(
    frame(model, p),
    viewport,
    browserCanvasFactory,
  ) as unknown as HTMLCanvasElement;
  return canvas.toDataURL('image/png');
}

declare global {
  interface Window {
    __coreRender: typeof renderCore;
  }
}
window.__coreRender = renderCore;
