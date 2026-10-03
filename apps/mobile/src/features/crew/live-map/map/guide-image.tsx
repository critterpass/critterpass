/**
 * The guide beside the meet-up pin, drawn as a plain image. A Skia canvas inside a native map
 * annotation does not always get a surface (it drew on some captures and not others), so the
 * sticker is rendered once to PNG through the same renderer and cache as `<Sticker>` (paper edge
 * included) and shown with `Image`, which annotations always draw. The drawn picture is the
 * accessible element, named after the guide: inside an accessible wrapper iOS would fold it away.
 */
import { useEffect, useState } from 'react';
import { Image, PixelRatio, View } from 'react-native';

import type { GuideStickerInfo } from '@/ui/avatar/guides';
import { renderStickerPng } from '@/ui/sticker/export-png';
import { nearestBucket } from '@/ui/sticker/bucket';
import { specKey } from '@/ui/sticker/spec-key';
import {
  DEFAULT_STICKER_EDGE,
  getDefaultSkiaCache,
  getDefaultSkiaEngine,
} from '@/ui/sticker/Sticker';

export type GuidePngRenderer = (kind: string, sizePt: number) => Promise<Uint8Array>;

const ART_VERSION = 'sticker-dev-1';
/** Size of the guide beside the meet-up pin. */
export const GUIDE_IMAGE_PT = 44;

/** The app's sticker renderer and cache (the same PNGs `<Sticker>` caches). */
export const renderGuidePng: GuidePngRenderer = async (kind, sizePt) => {
  const scale = PixelRatio.get();
  const bucket = nearestBucket(sizePt);
  const spec = { kind, seed: 7, closedEyes: false, sticker: DEFAULT_STICKER_EDGE };
  const engine = getDefaultSkiaEngine();
  return getDefaultSkiaCache().getOrRender(specKey(spec, bucket, scale, false, ART_VERSION), () =>
    Promise.resolve(renderStickerPng(spec, bucket, scale, engine)),
  );
};

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function GuideImage({
  guide,
  size,
  render = renderGuidePng,
}: {
  readonly guide: GuideStickerInfo;
  readonly size: number;
  readonly render?: GuidePngRenderer;
}) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void render(guide.kind, size).then(
      (bytes) => {
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a data URI prefix, never copy.
        if (!cancelled) setUri(`data:image/png;base64,${toBase64(bytes)}`);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [guide.kind, size, render]);
  return (
    <View style={{ width: size, height: size }} testID={`live-guide-${guide.id}`}>
      {uri === null ? null : (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          resizeMode="contain"
          accessible
          accessibilityRole="image"
          accessibilityLabel={guide.name}
          testID={`live-guide-${guide.id}-image`}
        />
      )}
    </View>
  );
}
