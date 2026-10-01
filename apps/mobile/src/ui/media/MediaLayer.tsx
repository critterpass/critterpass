/**
 * A licensed photo (or a video loop's poster) under a colour hero's text: the photo at full
 * strength as a duotone drawn from the accent, with the hero's halftone over it at half strength
 * (the layer draws those dots; a hero showing a photo turns its own off). The blurhash shows while the file loads, and the photo fades in over it (at once under
 * reduced motion). No asset, or a file that fails to load, leaves the flat colour exactly as
 * before (a file that fails keeps the tinted blurhash). The file used is saved on the device, so
 * the hero draws offline too, from any saved size when the exact one is missing. When the
 * licence asks for it, the credit line sits in the hero's corner.
 */
import {
  Canvas,
  ColorMatrix,
  Group,
  Image,
  LinearGradient,
  Path,
  Rect,
  useImage,
  vec,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { saveMediaFile, savedMediaUri, savedStillUri } from '@/lib/media/media-files';
import { pickBySize, type MediaView } from '@/lib/media/variants';

import { Text } from '../text/Text';
import { dotGridPath } from '../textures/geometry';
import { TEXTURE } from '../textures/texture-tokens';
import { makeStyles, useTheme } from '../theme';
import { blurhashImage } from './blurhash-image';
import { duotoneMatrix, treatmentFor, type MediaSurface } from './duotone';
import { LoopVideo, loopPlayerAvailable } from './loop-video';

export interface MediaLayerProps {
  readonly media: MediaView | null | undefined;
  readonly surface: MediaSurface;
  readonly accent: string;
  /** `loop` plays a video asset's loop where motion and data allow; `still` never does. */
  readonly motion?: 'loop' | 'still';
  /** Low data: stills only, the smallest that covers the slot, never a loop. */
  readonly lowData?: boolean;
  /** The corner the licence credit sits in. @default 'bottom' */
  readonly creditAt?: 'top' | 'bottom';
  readonly testID?: string;
}

const FADE_MS = 200;
/** The dark halftone's dot (textures/halftone.tsx). */
const DARK_DOT_RADIUS = 1.3;
/** The halftone over a photo is half its strength on the flat colour, so the photo reads. */
const DOTS_OVER_PHOTO = 0.5;
/** A low-data slot loads a smaller still (it is tinted and dotted anyway). */
const LOW_DATA_SCALE = 0.5;

const useStyles = makeStyles((t) => ({
  credit: {
    position: 'absolute',
    end: t.space['12'],
    paddingHorizontal: t.space['6'],
    opacity: 0.85,
  },
}));

function Still({
  media,
  uri,
  width,
  height,
  matrix,
  opacity,
  animate,
  fadeTo,
}: {
  readonly media: MediaView;
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly matrix: number[];
  readonly opacity: number;
  readonly animate: boolean;
  /** On the dark scaffold the band, with its dark halftone, fades into it at both edges. */
  readonly fadeTo: string | null;
}) {
  const image = useImage(uri);
  const placeholder = useMemo(() => blurhashImage(media.blurhash), [media.blurhash]);
  const fade = useSharedValue(0);
  useEffect(() => {
    if (image === null) return;
    fade.value = animate ? withTiming(1, { duration: FADE_MS }) : 1;
  }, [image, animate, fade]);
  const frame = { x: 0, y: 0, width, height };
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Group opacity={opacity}>
        {placeholder === null ? null : (
          <Image image={placeholder} fit="cover" {...frame}>
            <ColorMatrix matrix={matrix} />
          </Image>
        )}
        {image === null ? null : (
          <Group opacity={fade}>
            <Image image={image} fit="cover" {...frame}>
              <ColorMatrix matrix={matrix} />
            </Image>
          </Group>
        )}
      </Group>
      <Group opacity={DOTS_OVER_PHOTO}>
        {fadeTo === null ? (
          <Path
            path={dotGridPath(width, height, TEXTURE.halftone.grid, TEXTURE.halftone.radius)}
            color={TEXTURE.halftone.color}
          />
        ) : (
          TEXTURE.halftoneDark.layers.map(({ color, grid }, index) => (
            <Path
              key={`${color}-${grid}`}
              path={dotGridPath(width, height, grid, DARK_DOT_RADIUS, (index * grid) / 2)}
              color={color}
            />
          ))
        )}
      </Group>
      {fadeTo === null ? null : (
        <Rect {...frame}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            colors={[fadeTo, `${fadeTo}00`, `${fadeTo}00`, fadeTo]}
            positions={[0, 0.2, 0.55, 1]}
          />
        </Rect>
      )}
    </Canvas>
  );
}

export function MediaLayer({
  media,
  surface,
  accent,
  motion = 'still',
  lowData = false,
  creditAt = 'bottom',
  testID,
}: MediaLayerProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reduced = useReducedMotion();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== size?.width || height !== size.height) setSize({ width, height });
  };
  const treatment = treatmentFor(surface, accent, theme.color.ink['850']);
  const matrix = useMemo(
    () => duotoneMatrix(treatment.shadow, treatment.highlight),
    [treatment.shadow, treatment.highlight],
  );
  const pixels = (size?.width ?? 0) * PixelRatio.get() * (lowData ? LOW_DATA_SCALE : 1);
  const still = media ? pickBySize(media.images, pixels) : undefined;
  const saved = media && still ? savedStillUri(media, still.url) : null;
  useEffect(() => {
    // Save what the hero shows, so it draws offline next time.
    if (media && still && saved === null) void saveMediaFile(media.id, still.url);
  }, [media, still, saved]);
  if (!media || !still) return null;
  const loop =
    motion === 'loop' && !reduced && !lowData && loopPlayerAvailable()
      ? pickBySize(media.videos, pixels)
      : undefined;
  const creditColour =
    surface === 'accent' ? theme.semantic.text.onAccent : theme.semantic.text.secondary;
  return (
    <>
      <View
        testID={testID}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={onLayout}
      >
        {size && size.width > 0 && size.height > 0 ? (
          <Still
            media={media}
            uri={saved ?? still.url}
            width={size.width}
            height={size.height}
            matrix={matrix}
            opacity={treatment.opacity}
            animate={!reduced}
            fadeTo={surface === 'dark' ? treatment.base : null}
          />
        ) : null}
        {loop === undefined ? null : (
          <LoopVideo
            video={loop}
            localUri={savedMediaUri(media.id, loop.url)}
            tint={accent}
            opacity={treatment.opacity}
          />
        )}
      </View>
      {media.attribution_required ? (
        <Text
          variant="caption"
          color={creditColour}
          numberOfLines={1}
          style={[styles.credit, creditAt === 'top' ? { top: 6 } : { bottom: 6 }]}
          testID={testID === undefined ? undefined : `${testID}-credit`}
        >
          {media.credit}
        </Text>
      ) : null}
    </>
  );
}
