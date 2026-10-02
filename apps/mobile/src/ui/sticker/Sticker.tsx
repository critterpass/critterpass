import { Canvas, Picture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Dimensions, PixelRatio, View } from 'react-native';
import { useFrameCallback } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { SharedValue } from 'react-native-reanimated';

import type { Blend, FormSpec, Pose, RenderSpec, StickerSpec, Variant } from '@cp/critter-art';
import type { SkiaEngine } from '@cp/critter-art/skia';
import { tokens } from '@cp/design-tokens';

import { reportUiQa, UI_QA_ENABLED } from '../qa/ui-qa';

import { stickerLabel, stickerPoseLabel } from './a11y';
import { nearestBucket } from './bucket';
import type { StickerCache } from './cache';
import { CancelledDraw, type DrawRequest } from './draw-queue';
import { renderStickerPicture, renderStickerPng } from './export-png';
import { specKey } from './spec-key';
import {
  getDefaultSkiaCache,
  getDefaultSkiaEngine,
  getRasterSkiaEngine,
  pngUri,
  pngUris,
  stickerDrawQueue,
} from './sticker-runtime';
import { StickerImage } from './StickerImage';

export { getDefaultSkiaCache, getDefaultSkiaEngine, stickerDrawQueue };

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
  /** Composite for the art's washes: `srcOver` is design's `blend="source-over"` (icons on dark UI). */
  readonly blend?: Blend;
  readonly size: number;
  /**
   * The die-cut edge. Every critter the design draws wears the paper-white sticker edge, so that is
   * the default; `null` draws the bare art (silhouettes and masked icons, which the design leaves
   * without an edge).
   */
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

/** docs/design-system.md: the sticker edge is `paper.base`. */
export const DEFAULT_STICKER_EDGE: StickerSpec = { color: tokens.color.paper.base };

/** The edge a sticker is drawn with: the paper edge unless it opts out, or it is a mask. */
export function resolveStickerEdge(
  sticker: StickerSpec | null | undefined,
  variant: Variant | undefined,
): StickerSpec | null {
  if (sticker !== undefined) return sticker;
  return variant === 'mask' ? null : DEFAULT_STICKER_EDGE;
}

function buildRenderSpec(props: StickerProps): RenderSpec {
  const {
    kind,
    form,
    pose,
    variant,
    maskColor,
    blend,
    sticker,
    seed = 7,
    closedEyes = false,
  } = props;
  return {
    kind,
    seed,
    closedEyes,
    ...(form ? { form } : {}),
    ...(pose ? { pose } : {}),
    ...(variant ? { variant } : {}),
    ...(maskColor ? { maskColor } : {}),
    ...(blend ? { blend } : {}),
    sticker: resolveStickerEdge(sticker, variant),
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
  // Finished stickers draw on the CPU (see getRasterSkiaEngine); a live draw-on stays as it was.
  const pngEngine = props.engine ?? getRasterSkiaEngine();
  const cache = props.cache ?? getDefaultSkiaCache();
  const deviceScale = props.deviceScale ?? PixelRatio.get();
  const artVersion = props.artVersion ?? DEFAULT_ART_VERSION;

  const spec = useMemo(() => buildRenderSpec(props), [props]);
  const bucketPt = nearestBucket(size);
  const key = specKey(spec, bucketPt, deviceScale, closedEyes, artVersion);

  const [loaded, setUri] = useState<string | null>(null);
  // Known already (this sticker drew before): shown in the first frame, no blank flash.
  const uri = pngUris.get(key) ?? loaded;

  useEffect(() => {
    // Icons draw bare by design: masks, and the `srcOver` line icons on dark UI (the egg tab icon).
    const icon = spec.variant === 'mask' || spec.blend === 'srcOver';
    if (UI_QA_ENABLED && spec.sticker === null && !icon) {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a report code, never shown to a user
      reportUiQa('STICKER_NO_OUTLINE', `${props.kind}:${name}`);
    }
  }, [spec, props.kind, name]);

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

  // Where the sticker sits: on screen draws first, below the fold later (see draw-queue).
  const place = useRef<ComponentRef<typeof View>>(null);
  const priority = useRef(0);
  const request = useRef<DrawRequest<Uint8Array> | null>(null);
  const onLayout = () => {
    place.current?.measureInWindow((_x, y, _w, h) => {
      const below = Math.max(0, y - Dimensions.get('window').height);
      priority.current = y + h < 0 ? below + 1 : below;
      request.current?.prioritise(priority.current);
    });
  };

  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (isLive) return undefined;
    // Shown already (this picture drew before): no fade, it is there from the first frame.
    const known = pngUris.has(key);
    let unmounted = false;
    const draw = () => {
      const started = UI_QA_ENABLED ? performance.now() : 0;
      const bytes = renderStickerPng(spec, bucketPt, deviceScale, pngEngine);
      if (UI_QA_ENABLED) {
        // Read by the device shards: what drawing new stickers costs the JS thread.
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a log tag, never copy.
        console.info(`[sticker-encode] ${(performance.now() - started).toFixed(2)}`);
      }
      return bytes;
    };
    const load = (): void => {
      void cache
        .getOrRender(key, () => {
          // Drawn in its turn, one sticker per task, never inside this render.
          request.current = stickerDrawQueue.request(key, draw, priority.current);
          return request.current.result;
        })
        .then(
          (bytes) => {
            if (unmounted) return;
            setUri(pngUri(key, bytes));
            if (!known) setFresh(true);
          },
          (error: unknown) => {
            // Another sticker with this picture went away before it was drawn: ask again.
            if (!unmounted && error instanceof CancelledDraw) load();
          },
        );
    };
    load();
    return () => {
      unmounted = true;
      request.current?.cancel();
      request.current = null;
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
      ref={place}
      onLayout={onLayout}
      style={{ width: size, height: size }}
      accessible
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={label}
      onTouchEnd={onPress}
    >
      {livePicture ? (
        <Canvas style={{ width: size, height: size }}>
          <Picture picture={livePicture} />
        </Canvas>
      ) : uri ? (
        // A finished sticker is a plain image: a live canvas is a GL surface of its own, and a
        // screen of them (the Critterdex grid) left the next screen without surfaces on Android.
        // Until it is drawn the slot shows its own background, never a silhouette ("not found").
        <StickerImage uri={uri} size={size} fade={fresh} />
      ) : null}
    </View>
  );
}
