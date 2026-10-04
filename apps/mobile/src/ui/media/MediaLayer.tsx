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
import { duotoneMatrix, treatmentFor, type DuotoneTreatment, type MediaSurface } from './duotone';
import { LoopVideo, loopPlayerAvailable } from './loop-video';

export interface MediaLayerProps {
  readonly media: MediaView | null | undefined;
  readonly surface: MediaSurface;
  readonly accent: string;
  /** `loop` plays a video asset's loop where motion and data allow; `still` never does. */
  readonly motion?: 'loop' | 'still';
  /** Low data: stills only, the smallest that covers the slot, never a loop. */
  readonly lowData?: boolean;
  /** The hero's halftone over the photo (at half strength); off where the hero has none. @default true */
  readonly dots?: boolean;
  /**
   * `colour` draws the photo as it is (a small card's picture, with no text over it); `duotone`
   * tints it to the accent under a hero's text. @default 'duotone'
   */
  readonly tone?: 'duotone' | 'colour';
  /** The corner the licence credit sits in. @default 'bottom' */
  readonly creditAt?: 'top' | 'bottom';
  /** The side the credit starts from; a small card's reads from the start. @default 'end' */
  readonly creditAlign?: 'start' | 'end';
  readonly testID?: string;
}

const FADE_MS = 200;

/** `#rrggbb` with an alpha channel. */
function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}
/** The dark halftone's dot (textures/halftone.tsx). */
const DARK_DOT_RADIUS = 1.3;
/** The halftone over a photo is half its strength on the flat colour, so the photo reads. */
const DOTS_OVER_PHOTO = 0.5;
/** A low-data slot loads a smaller still (it is tinted and dotted anyway). */
const LOW_DATA_SCALE = 0.5;

/** The credit line's inset from the layer's sides, and the credit's own padding (the styles below). */
const CREDIT_INSET = 12 + 6;
/** A caption letter's average width, for telling whether a credit fits its line. */
const CREDIT_CHAR_PT = 5.8;

/**
 * The credit a layer this wide shows on its one line: the whole line when it fits, else the author
 * alone (the credit's first part; the whole credit is on the place page). Unmeasured, the whole.
 */
export function creditFor(credit: string, widthPt: number | null): string {
  if (widthPt === null) return credit;
  if (credit.length * CREDIT_CHAR_PT <= widthPt - 2 * CREDIT_INSET) return credit;
  return credit.split(' · ')[0] ?? credit;
}

const useStyles = makeStyles((t) => ({
  creditLine: {
    position: 'absolute',
    start: t.space['12'],
    end: t.space['12'],
    flexDirection: 'row',
  },
  credit: { flexShrink: 1, paddingHorizontal: t.space['6'], opacity: 0.85 },
  creditOnPhoto: { backgroundColor: t.semantic.bg.base, borderRadius: t.radius.xs },
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
  scrim,
  dots,
}: {
  readonly media: MediaView;
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  /** The duotone; null draws the photo in its own colours. */
  readonly matrix: number[] | null;
  readonly opacity: number;
  readonly animate: boolean;
  /** On the dark scaffold the band, with its dark halftone, fades into it at both edges. */
  readonly fadeTo: string | null;
  readonly scrim: DuotoneTreatment['scrim'];
  readonly dots: boolean;
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
            {matrix === null ? null : <ColorMatrix matrix={matrix} />}
          </Image>
        )}
        {image === null ? null : (
          <Group opacity={fade}>
            <Image image={image} fit="cover" {...frame}>
              {matrix === null ? null : <ColorMatrix matrix={matrix} />}
            </Image>
          </Group>
        )}
      </Group>
      <Group opacity={dots ? DOTS_OVER_PHOTO : 0}>
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
      {fadeTo === null || scrim === null ? null : (
        <Rect {...frame}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, height)}
            // Solid at both edges (no hard line into the scaffold); behind the dates line and the
            // wordmark row only as much ink as their contrast needs, so the photo stays bright.
            colors={[
              fadeTo,
              withAlpha(fadeTo, scrim.eyebrow),
              withAlpha(fadeTo, scrim.eyebrow),
              withAlpha(fadeTo, scrim.title),
              withAlpha(fadeTo, scrim.title),
              fadeTo,
            ]}
            positions={[0, 0.06, 0.22, 0.32, 0.9, 1]}
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
  dots = true,
  tone = 'duotone',
  creditAt = 'bottom',
  creditAlign = 'end',
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
            matrix={tone === 'colour' ? null : matrix}
            opacity={treatment.opacity}
            animate={!reduced}
            fadeTo={surface === 'dark' && tone === 'duotone' ? treatment.base : null}
            scrim={tone === 'duotone' ? treatment.scrim : null}
            dots={dots}
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
        <View
          pointerEvents="none"
          style={[
            styles.creditLine,
            { justifyContent: creditAlign === 'start' ? 'flex-start' : 'flex-end' },
            creditAt === 'top' ? { top: 6 } : { bottom: 6 },
          ]}
        >
          <Text
            variant="caption"
            color={creditColour}
            numberOfLines={1}
            // On a photo in its own colours the line sits on ink, so it reads whatever is under it.
            style={[styles.credit, tone === 'colour' ? styles.creditOnPhoto : null]}
            testID={testID === undefined ? undefined : `${testID}-credit`}
          >
            {creditFor(media.credit, size?.width ?? null)}
          </Text>
        </View>
      ) : null}
    </>
  );
}
