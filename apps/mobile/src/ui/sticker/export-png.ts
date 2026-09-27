import type { RenderSpec } from '@cp/critter-art';
import { build, frame, layout } from '@cp/critter-art';
import type { SkiaEngine } from '@cp/critter-art/skia';
import { renderToPicture, toImage, viewportFor } from '@cp/critter-art/skia';

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
  const model = build(spec, sizePt);
  const boxLayout = layout(spec, sizePt);
  const viewport = viewportFor(boxLayout, deviceScale);
  const picture = renderToPicture(frame(model, 1), viewport, deps.engine);
  const image = toImage(deps.engine, picture, viewport.widthPx, viewport.heightPx);
  const bytes = image.encodeToBytes();
  if (!bytes) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- programmer-error diagnostic, never shown to a user
    throw new Error(`exportPng: SkImage.encodeToBytes returned null for "${spec.kind}"`);
  }
  await deps.writeBytes(destPath, bytes);
}
