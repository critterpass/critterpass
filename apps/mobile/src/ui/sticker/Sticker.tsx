import { Canvas, Image as SkiaImage, Picture } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import type * as RNSkiaModule from '@shopify/react-native-skia';
import type * as ExpoFileSystemModule from 'expo-file-system';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PixelRatio, View } from 'react-native';
import { useFrameCallback } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { SharedValue } from 'react-native-reanimated';

import type { FormSpec, Pose, RenderSpec, StickerSpec, Variant } from '@cp/critter-art';
import type { SkiaEngine } from '@cp/critter-art/skia';

import { stickerLabel, stickerPoseLabel } from './a11y';
import { nearestBucket } from './bucket';
import { DiskLruCache, MemoryLruCache, StickerCache } from './cache';
import type { StickerDiskFs } from './cache';
import { renderStickerPicture, renderStickerPng } from './export-png';
import { specKey } from './spec-key';

const MEMORY_CACHE_MAX_BYTES = 25 * 1024 * 1024;
const DISK_CACHE_MAX_BYTES = 60 * 1024 * 1024;

let defaultEngine: SkiaEngine | undefined;

/**
 * Lazily adapts the real `@shopify/react-native-skia` `Skia` singleton to this backend's
 * `SkiaEngine` shape (only `Image.MakeImageFromEncoded` needs adapting — real Skia takes an
 * `SkData`, not raw bytes, unlike this engine's contract). `require`d lazily so importing this
 * module never forces the native Skia JSI binding to load (e.g. under Jest, which always injects
 * its own `engine` prop instead and never reaches this function).
 */
function getDefaultSkiaEngine(): SkiaEngine {
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

// The bake pipeline's own content-hash manifest is the real source of truth for this value; a
// caller that cares about cache invalidation across an art/content bump passes its own
// `artVersion` (see `@cp/critter-bake`'s `computeArtVersion`) — this default only guards against
// a stale cache surviving *this component's own* code changes during development.
const DEFAULT_ART_VERSION = 'sticker-dev-1';

export interface StickerProps {
  readonly kind: string;
  /** The critter's display name, for the default a11y label ("{name}, {form} form"). */
  readonly name: string;
  readonly form?: FormSpec;
  readonly pose?: Pose;
  readonly variant?: Variant;
  /** The `variant="mask"` recolour — `SilhouetteSlot` passes its grey/gold silhouette colour here. */
  readonly maskColor?: string;
  readonly size: number;
  readonly sticker?: StickerSpec | null;
  readonly seed?: number;
  readonly closedEyes?: boolean;
  /** A Reanimated shared value driving the hero draw-on (0..1); absent = static final frame (also the Reduce Motion path). */
  readonly drawProgress?: SharedValue<number>;
  /** Accepted for parity with the motion runtime's `LiveSticker` wrapper — this component renders only, it never times its own draw-on. */
  readonly delay?: number;
  readonly onPress?: () => void;
  readonly artVersion?: string;
  readonly deviceScale?: number;
  /** Test/integration seam — defaults to the real `@shopify/react-native-skia` engine. */
  readonly engine?: SkiaEngine;
  /** Test/integration seam — defaults to a lazily-constructed on-device cache. */
  readonly cache?: StickerCache;
}

function buildRenderSpec(props: StickerProps): RenderSpec {
  const { kind, form, pose, variant, maskColor, sticker, seed = 7, closedEyes = false } = props;
  return {
    kind,
    seed,
    closedEyes,
    ...(form ? { form } : {}),
    ...(pose ? { pose } : {}),
    ...(variant ? { variant } : {}),
    ...(maskColor ? { maskColor } : {}),
    ...(sticker !== undefined ? { sticker } : {}),
  };
}

/**
 * The app's single sticker component: renders a cached static image by default, or a live
 * draw-on when `drawProgress` is given — snapshotting the finished frame (`p >= 1`) into the
 * sticker cache so the next mount renders the fast, static path. Timing/gating (delay, the ≤2
 * concurrent draw-on budget, the blink swap) belong to the motion runtime that drives
 * `drawProgress`; this component only reacts to its current value.
 */
export function Sticker(props: StickerProps): React.JSX.Element {
  const { size, closedEyes = false, drawProgress, onPress, name, pose } = props;
  const engine = props.engine ?? getDefaultSkiaEngine();
  const cache = props.cache ?? getDefaultSkiaCache();
  const deviceScale = props.deviceScale ?? PixelRatio.get();
  const artVersion = props.artVersion ?? DEFAULT_ART_VERSION;

  const spec = useMemo(() => buildRenderSpec(props), [props]);
  const bucketPt = nearestBucket(size);
  const key = specKey(spec, bucketPt, deviceScale, closedEyes, artVersion);

  const [image, setImage] = useState<SkImage | null>(null);

  // Re-renders every native frame while a draw-on is in flight so `drawProgress.value` (read fresh
  // below) drives the live picture; under Jest's reanimated double this callback never fires
  // (no native UI runtime), which is fine — tests drive frames by changing `drawProgress` directly.
  const [, forceTick] = useState(0);
  // The frame callback runs on the UI thread, where calling a React state setter directly throws
  // and aborts the app; hop the re-render request back to the JS thread instead.
  const bump = useCallback(() => forceTick((tick) => tick + 1), []);
  useFrameCallback(() => {
    if (drawProgress && drawProgress.value < 1) scheduleOnRN(bump);
  }, Boolean(drawProgress));

  const liveProgress = drawProgress ? drawProgress.value : 1;
  const isLive = liveProgress < 1;

  useEffect(() => {
    if (isLive) return;
    let cancelled = false;
    void cache
      .getOrRender(key, () =>
        Promise.resolve(renderStickerPng(spec, bucketPt, deviceScale, engine)),
      )
      .then((bytes) => {
        if (cancelled) return;
        setImage(engine.Image.MakeImageFromEncoded(bytes));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `spec`/`engine`/`cache` are stable per key; re-running on `key` alone avoids re-rendering identical work every frame
  }, [key, isLive]);

  const livePicture = useMemo(() => {
    if (!isLive) return null;
    return renderStickerPicture(spec, bucketPt, deviceScale, engine, liveProgress).picture;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the effect above
  }, [key, isLive, liveProgress]);

  const label = pose
    ? stickerPoseLabel(name, pose)
    : stickerLabel(name, spec.form?.rarity ?? 'common');

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={label}
      onTouchEnd={onPress}
    >
      <Canvas style={{ width: size, height: size }}>
        {livePicture ? (
          <Picture picture={livePicture} />
        ) : image ? (
          <SkiaImage image={image} x={0} y={0} width={size} height={size} fit="contain" />
        ) : null}
      </Canvas>
    </View>
  );
}
