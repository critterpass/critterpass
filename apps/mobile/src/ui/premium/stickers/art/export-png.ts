import type { RenderSpec } from '@cp/critter-art';
import { build, frame, layout } from '@cp/critter-art';
import type { RasterViewport, SkiaEngine } from '@cp/critter-art/skia';
import { renderToPicture, toImage, viewportFor } from '@cp/critter-art/skia';
import type { SkImage, SkPicture } from '@shopify/react-native-skia';

/** Builds the live `SkPicture` for one draw-on frame at `p` (0..1) — no encode, no cache; `<Sticker>`'s intermediate frames render this directly. */
export function renderStickerPicture(
  spec: RenderSpec,
  sizePt: number,
  deviceScale: number,
  engine: SkiaEngine,
  p: number,
): { readonly picture: SkPicture; readonly viewport: RasterViewport } {
  const model = build(spec, sizePt);
  const boxLayout = layout(spec, sizePt);
  const viewport = viewportFor(boxLayout, deviceScale);
  const picture = renderToPicture(frame(model, p), viewport, engine);
  return { picture, viewport };
}

/** Renders `spec`'s fully-drawn (`p = 1`) frame to a raster `SkImage` — the cacheable snapshot both `<Sticker>` and `exportPng` write out. */
export function renderStickerImage(
  spec: RenderSpec,
  sizePt: number,
  deviceScale: number,
  engine: SkiaEngine,
): SkImage {
  const { picture, viewport } = renderStickerPicture(spec, sizePt, deviceScale, engine, 1);
  return toImage(engine, picture, viewport.widthPx, viewport.heightPx);
}

/** Encodes `renderStickerImage`'s output to PNG bytes — the payload written to the sticker cache and to disk by `exportPng`. */
export function renderStickerPng(
  spec: RenderSpec,
  sizePt: number,
  deviceScale: number,
  engine: SkiaEngine,
): Uint8Array {
  const bytes = renderStickerImage(spec, sizePt, deviceScale, engine).encodeToBytes();
  if (!bytes) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- programmer-error diagnostic, never shown to a user
    throw new Error(`renderStickerPng: SkImage.encodeToBytes returned null for "${spec.kind}"`);
  }
  return bytes;
}

export interface ExportPngDeps {
  /** The real `@shopify/react-native-skia` `Skia` singleton on device; a `canvaskit-wasm` adapter in tests. */
  readonly engine: SkiaEngine;
  readonly writeBytes: (path: string, bytes: Uint8Array) => Promise<void>;
}

/**
 * Renders `spec` at `sizePt`/`deviceScale` via the Skia backend and writes the PNG to `destPath` —
 * the primitive App Group writers (widgets, notification extensions, `media.process` avatars) call
 * to hand a bitmap to a native module that only reads files, not JS memory.
 */
export async function exportPng(
  spec: RenderSpec,
  sizePt: number,
  deviceScale: number,
  destPath: string,
  deps: ExportPngDeps,
): Promise<void> {
  const bytes = renderStickerPng(spec, sizePt, deviceScale, deps.engine);
  await deps.writeBytes(destPath, bytes);
}
