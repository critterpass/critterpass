import { Path, Rect } from '@shopify/react-native-skia';
import { Image, PixelRatio, StyleSheet, View } from 'react-native';

import { stripesPath } from './geometry';
import { hatchTile, tilesSquare } from './hatch-tile';
import { TEXTURE } from './texture-tokens';
import { TextureCanvas } from './TextureCanvas';

export interface HatchProps {
  /** Muted fill under the stripes; defaults to the token's own base colour. */
  readonly baseColor?: string;
}

/**
 * `tex.hatch`: 135° light stripes on a muted fill (photo placeholders, loading skeletons). Drawn
 * once as a seamless tile and repeated as a plain image, so a hatched block costs no GL surface;
 * an angle that doesn't tile in a square (or a build without Skia's raster surface) draws live.
 */
export function Hatch({ baseColor }: HatchProps) {
  const { angle, color, width: stripe, gap, base } = TEXTURE.hatch;
  const tile = tilesSquare(angle)
    ? hatchTile({
        angleDeg: angle,
        stripePt: stripe,
        gapPt: gap,
        color,
        base: baseColor ?? base,
        scale: PixelRatio.get(),
      })
    : null;
  if (tile !== null) {
    return (
      <View
        testID="texture-hatch"
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Image
          source={{ uri: tile.uri, width: tile.sizePt, height: tile.sizePt, scale: tile.scale }}
          resizeMode="repeat"
          fadeDuration={0}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }
  return (
    <TextureCanvas testID="texture-hatch">
      {({ width, height }) => (
        <>
          <Rect x={0} y={0} width={width} height={height} color={baseColor ?? base} />
          <Path
            path={stripesPath(width, height, angle, stripe + gap)}
            color={color}
            style="stroke"
            strokeWidth={stripe}
          />
        </>
      )}
    </TextureCanvas>
  );
}
