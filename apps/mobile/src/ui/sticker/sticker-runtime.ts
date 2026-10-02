/**
 * The sticker runtime every sticker shares: the Skia engine, the memory and disk cache of drawn
 * stickers, the data URIs they show as, and the queue that draws new ones one per task.
 */
import type * as RNSkiaModule from '@shopify/react-native-skia';
import type * as ExpoFileSystemModule from 'expo-file-system';

import type { SkiaEngine } from '@cp/critter-art/skia';

import { DiskLruCache, MemoryLruCache, StickerCache } from './cache';
import type { StickerDiskFs } from './cache';
import { DrawQueue } from './draw-queue';

const MEMORY_CACHE_MAX_BYTES = 25 * 1024 * 1024;
/** Finished stickers as data URIs, by cache key: a remount shows its image in the first frame. */
const PNG_URIS_MAX = 400;
export const pngUris = new Map<string, string>();

export function pngUri(key: string, bytes: Uint8Array): string {
  const known = pngUris.get(key);
  if (known !== undefined) return known;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a data URI prefix, never copy.
  const uri = `data:image/png;base64,${btoa(binary)}`;
  if (pngUris.size >= PNG_URIS_MAX) {
    const oldest = pngUris.keys().next().value;
    if (oldest !== undefined) pngUris.delete(oldest);
  }
  pngUris.set(key, uri);
  return uri;
}
const DISK_CACHE_MAX_BYTES = 60 * 1024 * 1024;

let defaultEngine: SkiaEngine | undefined;

/**
 * Lazily adapts the real `@shopify/react-native-skia` `Skia` singleton to this backend's
 * `SkiaEngine` shape (only `Image.MakeImageFromEncoded` needs adapting — real Skia takes an
 * `SkData`, not raw bytes, unlike this engine's contract). `require`d lazily so importing this
 * module never forces the native Skia JSI binding to load (e.g. under Jest, which always injects
 * its own `engine` prop instead and never reaches this function).
 */
export function getDefaultSkiaEngine(): SkiaEngine {
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
    };
  }
  return defaultEngine;
}

let rasterEngine: SkiaEngine | undefined;

/**
 * The engine finished stickers are drawn with: the default engine on CPU raster surfaces
 * (`Surface.Make`) instead of GPU offscreen ones. A finished sticker is read back to PNG bytes
 * straight away, so the GPU only added its context start-up (over a second for the session's first
 * sticker) and a read-back sync for every layer; the hatch and icons already draw this way.
 */
export function getRasterSkiaEngine(): SkiaEngine {
  if (!rasterEngine) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, lingui/no-unlocalized-strings -- lazy native-module load, see getDefaultSkiaEngine
    const { Skia } = require('@shopify/react-native-skia') as typeof RNSkiaModule;
    rasterEngine = {
      ...getDefaultSkiaEngine(),
      Surface: {
        MakeOffscreen: (width: number, height: number) => Skia.Surface.Make(width, height),
      },
    };
  }
  return rasterEngine;
}

let defaultCache: StickerCache | undefined;

/** Lazily builds the on-device cache over `expo-file-system`'s cache directory — see the doc comment on `getDefaultSkiaEngine` for why this is lazy. Exported for the sticker lab's cache-size readout, which reports on this same default instance's `memoryBytes` rather than a private grid-only copy. */
export function getDefaultSkiaCache(): StickerCache {
  if (!defaultCache) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native-module load, see doc comment above
    const { Directory, File, Paths } = require('expo-file-system') as typeof ExpoFileSystemModule;
    const fs: StickerDiskFs = {
      cacheDirectory: Paths.cache.uri,
      exists: (path) => Promise.resolve(new File(path).exists),
      readBytes: (path) => new File(path).bytes(),
      writeBytes: async (path, bytes) => {
        const file = new File(path);
        file.create({ intermediates: true, overwrite: true });
        await file.write(bytes);
      },
      deleteFile: (path) => {
        const file = new File(path);
        if (file.exists) file.delete();
        return Promise.resolve();
      },
      listFiles: (dir) => {
        const directory = new Directory(dir);
        if (!directory.exists) return Promise.resolve([]);
        return Promise.resolve(
          directory
            .list()
            .filter((entry) => entry instanceof File)
            .map((file) => file.uri.slice(dir.length)),
        );
      },
      statFile: (path) => {
        const file = new File(path);
        return Promise.resolve({ size: file.size, modifiedMs: file.lastModified ?? 0 });
      },
    };
    defaultCache = new StickerCache(
      new MemoryLruCache(MEMORY_CACHE_MAX_BYTES),
      new DiskLruCache(fs, DISK_CACHE_MAX_BYTES),
    );
  }
  return defaultCache;
}

/** Every sticker shares one queue, so a whole screen draws one sticker per task. */
export const stickerDrawQueue = new DrawQueue<Uint8Array>();
