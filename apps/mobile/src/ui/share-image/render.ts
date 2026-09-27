import type { CardLayout, ShareSkiaEngine } from '@cp/critter-art/share';
import { renderCardSkia } from '@cp/critter-art/share';
import type { SkImage, SkTypeface } from '@shopify/react-native-skia';
import type * as RNSkiaModule from '@shopify/react-native-skia';
import type * as ExpoFileSystemModule from 'expo-file-system';

let defaultEngine: ShareSkiaEngine | undefined;

/** Lazily adapts the real `Skia` singleton to `ShareSkiaEngine` — see `Sticker.tsx`'s `getDefaultSkiaEngine` for why this stays lazy (never forces the native Skia JSI binding to load under Jest, which always injects its own `engine`). */
function getDefaultShareEngine(): ShareSkiaEngine {
  if (!defaultEngine) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, lingui/no-unlocalized-strings -- lazy native-module load, see doc comment above
    const { Skia } = require('@shopify/react-native-skia') as typeof RNSkiaModule;
    defaultEngine = {
      Path: Skia.Path,
      Paint: () => Skia.Paint(),
      PictureRecorder: () => Skia.PictureRecorder(),
      Surface: Skia.Surface,
      ImageFilter: Skia.ImageFilter,
      Color: (color: string) => Skia.Color(color),
      Image: {
        MakeImageFromEncoded: (bytes: Uint8Array) =>
          Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes)),
      },
      Font: (typeface, size) => Skia.Font(typeface ?? undefined, size),
      measureText: (font, value) => font.measureText(value).width,
      Typeface: {
        MakeFreeTypeFaceFromData: (bytes: Uint8Array) =>
          Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(bytes)),
      },
      XYWHRect: (x, y, w, h) => Skia.XYWHRect(x, y, w, h),
      RRectXY: (rect, rx, ry) => Skia.RRectXY(rect, rx, ry),
    };
  }
  return defaultEngine;
}

/** Reads a local file URI's bytes via `expo-file-system` and decodes it into an `SkImage` — the app-side counterpart of the Node backend's `loadImage(uri)`. */
async function loadLocalImage(engine: ShareSkiaEngine, uri: string): Promise<SkImage | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native-module load, see getDefaultShareEngine's doc comment
  const { File } = require('expo-file-system') as typeof ExpoFileSystemModule;
  const bytes = await new File(uri).bytes();
  const image = engine.Image.MakeImageFromEncoded(bytes);
  return image ?? undefined;
}

export interface RenderShareImageDeps {
  readonly engine: ShareSkiaEngine;
  readonly loadImage: (engine: ShareSkiaEngine, uri: string) => Promise<SkImage | undefined>;
}

/**
 * Renders a share-template `CardLayout` on device: resolves every `image` node's local URI to a
 * decoded `SkImage` (photos only — stickers render through the layout's own `sticker` nodes), then
 * rasterizes via the Skia backend. `fonts` must already be loaded (`engine.Typeface.MakeFreeTypeFaceFromData`)
 * by the caller — which font files a template needs is that template's own concern (phase's share
 * templates), not this renderer's.
 */
export async function renderShareImage(
  layout: CardLayout,
  fonts: ReadonlyMap<string, SkTypeface>,
  deps: Partial<RenderShareImageDeps> = {},
): Promise<SkImage> {
  const engine = deps.engine ?? getDefaultShareEngine();
  const loadImageFn = deps.loadImage ?? loadLocalImage;

  const uris = new Set<string>();
  const collectUris = (nodes: CardLayout['nodes']): void => {
    for (const node of nodes) {
      if (node.type === 'image' && node.source.uri) uris.add(node.source.uri);
      if (node.type === 'frame') collectUris(node.children);
    }
  };
  collectUris(layout.nodes);

  const images = new Map<string, SkImage>();
  await Promise.all(
    [...uris].map(async (uri) => {
      const image = await loadImageFn(engine, uri);
      if (image) images.set(uri, image);
    }),
  );

  return renderCardSkia(layout, engine, fonts, images);
}
