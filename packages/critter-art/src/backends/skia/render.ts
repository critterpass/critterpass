import type {
  BlendMode,
  PaintStyle,
  SkCanvas,
  SkColor,
  SkImage,
  SkImageFilter,
  SkPaint,
  SkPicture,
  SkPictureRecorder,
  SkSurface,
  StrokeCap,
  StrokeJoin,
} from '@shopify/react-native-skia';

import type { Cmd, LayerCmd, PolyCmd, PolylineCmd } from '../../core/cmd';
import type { PathFactoryLike, Transform2D } from './paths';
import { pathFromPoints } from './paths';

// Numeric values of `@shopify/react-native-skia`'s `PaintStyle`/`StrokeCap`/`StrokeJoin`/`BlendMode`
// enums, typed (not imported) so this module never imports the real package at runtime, only its
// types — these values are stable Skia wire constants shared with `canvaskit-wasm`.
const PAINT_STYLE_FILL = 0 as PaintStyle;
const PAINT_STYLE_STROKE = 1 as PaintStyle;
const STROKE_CAP_BUTT = 0 as StrokeCap;
const STROKE_CAP_ROUND = 1 as StrokeCap;
const STROKE_JOIN_MITER = 0 as StrokeJoin;
const STROKE_JOIN_ROUND = 1 as StrokeJoin;
const BLEND_SRC_OVER = 3 as BlendMode;
const BLEND_MULTIPLY = 24 as BlendMode;

/**
 * The subset of the real `Skia` singleton (`@shopify/react-native-skia`) this backend needs.
 * Mobile passes the real object at runtime (it structurally satisfies this interface); tests pass
 * an adapter over `canvaskit-wasm` — the same Skia engine, compiled to WASM instead of natively —
 * so the parity test in `render.test.ts` exercises real Skia rasterization, not a mock.
 */
export interface SkiaEngine {
  readonly Path: PathFactoryLike;
  Paint(): SkPaint;
  PictureRecorder(): SkPictureRecorder;
  readonly Surface: { MakeOffscreen(width: number, height: number): SkSurface | null };
  readonly ImageFilter: {
    MakeDropShadow(
      dx: number,
      dy: number,
      sigmaX: number,
      sigmaY: number,
      color: SkColor,
      input?: SkImageFilter | null,
    ): SkImageFilter;
  };
  Color(color: string): SkColor;
}

export interface RasterViewport {
  readonly widthPx: number;
  readonly heightPx: number;
  /** Local (viewBox) units to pixels, already combined with device scale — see `viewportFor()`. */
  readonly contentScale: number;
  readonly padPx: number;
  /** Real device pixel ratio (no design 2.5x cap), used for shadow measurements in device pixels. */
  readonly deviceScale: number;
}

function blendMode(blend: 'multiply' | 'srcOver'): BlendMode {
  return blend === 'multiply' ? BLEND_MULTIPLY : BLEND_SRC_OVER;
}

function contentTransform(viewport: RasterViewport): Transform2D {
  return { scale: viewport.contentScale, tx: viewport.padPx, ty: viewport.padPx };
}

function drawPoly(
  canvas: SkCanvas,
  cmd: PolyCmd,
  viewport: RasterViewport,
  engine: SkiaEngine,
): void {
  const path = pathFromPoints(
    engine.Path,
    cmd.pts,
    true,
    contentTransform(viewport),
    cmd.dx ?? 0,
    cmd.dy ?? 0,
  );
  const paint = engine.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(PAINT_STYLE_FILL);
  paint.setColor(engine.Color(cmd.color));
  paint.setAlphaf(cmd.alpha);
  paint.setBlendMode(blendMode(cmd.blend));
  canvas.drawPath(path, paint);
}

function drawPolyline(
  canvas: SkCanvas,
  cmd: PolylineCmd,
  viewport: RasterViewport,
  engine: SkiaEngine,
): void {
  const transform = contentTransform(viewport);
  const path = pathFromPoints(
    engine.Path,
    cmd.pts,
    cmd.closed,
    transform,
    cmd.dx ?? 0,
    cmd.dy ?? 0,
  );
  const paint = engine.Paint();
  paint.setAntiAlias(true);
  paint.setStyle(PAINT_STYLE_STROKE);
  paint.setColor(engine.Color(cmd.color));
  paint.setAlphaf(cmd.alpha);
  paint.setBlendMode(blendMode(cmd.blend));
  paint.setStrokeWidth(cmd.width * transform.scale);
  paint.setStrokeJoin(cmd.join === 'round' ? STROKE_JOIN_ROUND : STROKE_JOIN_MITER);
  paint.setStrokeCap(cmd.cap === 'round' ? STROKE_CAP_ROUND : STROKE_CAP_BUTT);
  canvas.drawPath(path, paint);
}

/**
 * Paints a `'layer'` cmd into its own full-viewport offscreen `SkSurface` (identical structure to
 * the canvas2d backend's per-layer offscreen canvas, for pixel parity), then composites the
 * resulting image onto the parent canvas at `(0, 0)` — every canvas in this module stays at the
 * identity matrix, so compositing never needs a matrix reset.
 */
function drawLayer(
  canvas: SkCanvas,
  cmd: LayerCmd,
  viewport: RasterViewport,
  engine: SkiaEngine,
): void {
  const surface = engine.Surface.MakeOffscreen(viewport.widthPx, viewport.heightPx);
  if (!surface) throw new Error('renderToPicture: Skia.Surface.MakeOffscreen returned null');
  const layerCanvas = surface.getCanvas();
  for (const child of cmd.cmds) drawCmd(layerCanvas, child, viewport, engine);
  surface.flush();
  const image = surface.makeImageSnapshot();

  const paint = engine.Paint();
  paint.setAlphaf(cmd.alpha);
  if (cmd.shadow) {
    paint.setImageFilter(
      engine.ImageFilter.MakeDropShadow(
        0,
        cmd.shadow.dy * viewport.deviceScale,
        cmd.shadow.sigma * viewport.deviceScale,
        cmd.shadow.sigma * viewport.deviceScale,
        engine.Color(cmd.shadow.color),
      ),
    );
  }
  canvas.drawImage(image, 0, 0, paint);
}

function drawCmd(canvas: SkCanvas, cmd: Cmd, viewport: RasterViewport, engine: SkiaEngine): void {
  if (cmd.t === 'poly') drawPoly(canvas, cmd, viewport, engine);
  else if (cmd.t === 'polyline') drawPolyline(canvas, cmd, viewport, engine);
  else drawLayer(canvas, cmd, viewport, engine);
}

/**
 * Records a display list into an `SkPicture` sized to `viewport`'s pixels — the RN Skia
 * counterpart to the canvas2d backend's `renderToCanvas`.
 */
export function renderToPicture(
  cmds: readonly Cmd[],
  viewport: RasterViewport,
  engine: SkiaEngine,
): SkPicture {
  const recorder = engine.PictureRecorder();
  const canvas = recorder.beginRecording();
  for (const cmd of cmds) drawCmd(canvas, cmd, viewport, engine);
  return recorder.finishRecordingAsPicture();
}

/** Rasterizes a recorded picture to an `SkImage` at its native pixel size via an offscreen surface. */
export function toImage(
  engine: SkiaEngine,
  picture: SkPicture,
  widthPx: number,
  heightPx: number,
): SkImage {
  const surface = engine.Surface.MakeOffscreen(widthPx, heightPx);
  if (!surface) throw new Error('toImage: Skia.Surface.MakeOffscreen returned null');
  surface.getCanvas().drawPicture(picture);
  surface.flush();
  return surface.makeImageSnapshot();
}
