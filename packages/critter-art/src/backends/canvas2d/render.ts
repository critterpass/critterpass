import type { Cmd, LayerCmd, PolyCmd, PolylineCmd } from '../../core/cmd';

/**
 * Minimal 2D context surface the renderer needs — the intersection of DOM's
 * `CanvasRenderingContext2D` and `@napi-rs/canvas`'s context, so the same interpreter drives
 * both without this package depending on either at the type level.
 */
export interface Canvas2DContext {
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  drawImage(image: CanvasLike, dx: number, dy: number): void;
  globalAlpha: number;
  globalCompositeOperation: string;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: string;
  lineCap: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetY: number;
}

export interface CanvasLike {
  readonly width: number;
  readonly height: number;
  getContext(kind: '2d'): Canvas2DContext;
}

/** Creates a same-size canvas for isolated-layer compositing; browser and Node each provide their own. */
export type CanvasFactory = (width: number, height: number) => CanvasLike;

export interface RasterViewport {
  readonly widthPx: number;
  readonly heightPx: number;
  /** Local (viewBox) units to pixels — design's `k`. */
  readonly contentScale: number;
  readonly padPx: number;
  /** Real device pixel ratio (no design 2.5x cap), used for shadow measurements in points. */
  readonly deviceScale: number;
}

function coord(pts: Float32Array, index: number): number {
  const value = pts[index];
  if (value === undefined) {
    throw new RangeError(`command point index ${index} out of bounds (length ${pts.length})`);
  }
  return value;
}

function tracePath(
  ctx: Canvas2DContext,
  pts: Float32Array,
  close: boolean,
  dx: number,
  dy: number,
): void {
  ctx.beginPath();
  ctx.moveTo(coord(pts, 0) + dx, coord(pts, 1) + dy);
  for (let i = 2; i < pts.length; i += 2) {
    ctx.lineTo(coord(pts, i) + dx, coord(pts, i + 1) + dy);
  }
  if (close) ctx.closePath();
}

function drawPoly(ctx: Canvas2DContext, cmd: PolyCmd): void {
  ctx.save();
  ctx.globalCompositeOperation = cmd.blend === 'multiply' ? 'multiply' : 'source-over';
  ctx.globalAlpha = cmd.alpha;
  ctx.fillStyle = cmd.color;
  tracePath(ctx, cmd.pts, true, cmd.dx ?? 0, cmd.dy ?? 0);
  ctx.fill();
  ctx.restore();
}

function drawPolyline(ctx: Canvas2DContext, cmd: PolylineCmd): void {
  ctx.save();
  ctx.globalCompositeOperation = cmd.blend === 'multiply' ? 'multiply' : 'source-over';
  ctx.globalAlpha = cmd.alpha;
  ctx.strokeStyle = cmd.color;
  ctx.lineWidth = cmd.width;
  ctx.lineJoin = cmd.join;
  ctx.lineCap = cmd.cap;
  tracePath(ctx, cmd.pts, cmd.closed, cmd.dx ?? 0, cmd.dy ?? 0);
  ctx.stroke();
  ctx.restore();
}

function drawLayer(
  ctx: Canvas2DContext,
  cmd: LayerCmd,
  viewport: RasterViewport,
  createCanvas: CanvasFactory,
): void {
  const offscreen = createCanvas(viewport.widthPx, viewport.heightPx);
  const offscreenCtx = offscreen.getContext('2d');
  offscreenCtx.setTransform(
    viewport.contentScale,
    0,
    0,
    viewport.contentScale,
    viewport.padPx,
    viewport.padPx,
  );
  for (const child of cmd.cmds) drawCmd(offscreenCtx, child, viewport, createCanvas);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (cmd.shadow) {
    ctx.shadowColor = cmd.shadow.color;
    ctx.shadowBlur = 2 * cmd.shadow.sigma * viewport.deviceScale;
    ctx.shadowOffsetY = cmd.shadow.dy * viewport.deviceScale;
  }
  ctx.globalAlpha = cmd.alpha;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(offscreen, 0, 0);
  ctx.restore();
}

function drawCmd(
  ctx: Canvas2DContext,
  cmd: Cmd,
  viewport: RasterViewport,
  createCanvas: CanvasFactory,
): void {
  if (cmd.t === 'poly') {
    drawPoly(ctx, cmd);
  } else if (cmd.t === 'polyline') {
    drawPolyline(ctx, cmd);
  } else {
    drawLayer(ctx, cmd, viewport, createCanvas);
  }
}

/**
 * Rasterizes a display list into a fresh canvas at `viewport`'s pixel size. Every `'layer'` cmd
 * (including nested ones) renders to its own same-size offscreen canvas first so `multiply` and
 * shadows stay isolated to that layer's own content, then composites onto its parent.
 */
export function renderToCanvas(
  cmds: readonly Cmd[],
  viewport: RasterViewport,
  createCanvas: CanvasFactory,
): CanvasLike {
  const canvas = createCanvas(viewport.widthPx, viewport.heightPx);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, viewport.widthPx, viewport.heightPx);
  ctx.setTransform(
    viewport.contentScale,
    0,
    0,
    viewport.contentScale,
    viewport.padPx,
    viewport.padPx,
  );
  for (const cmd of cmds) drawCmd(ctx, cmd, viewport, createCanvas);
  return canvas;
}
