import {
  BlendColor,
  Canvas,
  Image as SkiaImage,
  Morphology,
  useImage,
} from '@shopify/react-native-skia';
import { Image, View } from 'react-native';

import { makeStyles, useTheme } from '../theme';

export interface PhotoAvatarProps {
  /** A cut-out PNG (subject with alpha) or a circle-cropped photo. */
  readonly uri: string;
  readonly size: number;
  /** The white sticker outline around a cut-out; a plain circle crop gets a white ring instead. */
  readonly cutout: boolean;
  readonly dimmed?: boolean;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: t.semantic.bg.raised,
  },
}));

/** Sticker outline width for an avatar of `size` points. */
export function outlineWidth(size: number): number {
  return Math.max(2, Math.round(size / 24));
}

/**
 * The lifted subject as a sticker: Skia draws the cut-out's alpha dilated by `outline` in white
 * (the sticker edge that follows the subject's shape), then the cut-out on top.
 */
function CutoutSticker({
  uri,
  side,
  outline,
  color,
}: {
  readonly uri: string;
  readonly side: number;
  readonly outline: number;
  readonly color: string;
}) {
  const image = useImage(uri);
  const frame = { x: outline, y: outline, width: side - outline * 2, height: side - outline * 2 };
  return (
    <Canvas style={{ width: side, height: side }}>
      {image === null ? null : (
        <>
          <SkiaImage image={image} fit="contain" {...frame}>
            <BlendColor color={color} mode="srcIn" />
            <Morphology operator="dilate" radius={outline} />
          </SkiaImage>
          <SkiaImage image={image} fit="contain" {...frame} />
        </>
      )}
    </Canvas>
  );
}

/**
 * A real photo avatar with the sticker treatment: the lifted subject sits in the circle with a white
 * outline traced around its shape, and a photo with no subject found is shown as a circle with a
 * white ring (the older-device fallback).
 */
export function PhotoAvatar({ uri, size, cutout, dimmed = false, testID }: PhotoAvatarProps) {
  const styles = useStyles();
  const theme = useTheme();
  const white = theme.color.paper.base;
  const outline = outlineWidth(size);
  return (
    <View
      testID={testID}
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: outline,
          borderColor: white,
          opacity: dimmed ? 0.7 : 1,
        },
      ]}
    >
      {cutout ? (
        <CutoutSticker uri={uri} side={size - outline * 2} outline={outline} color={white} />
      ) : (
        <Image
          source={{ uri }}
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          style={{ width: size, height: size }}
        />
      )}
    </View>
  );
}
