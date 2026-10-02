import { Path, Rect } from '@shopify/react-native-skia';
import { useState } from 'react';
import { Image, PixelRatio, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { stripesPath } from './geometry';
import { hatchImage } from './hatch-image';
import { TEXTURE } from './texture-tokens';
import { TextureCanvas } from './TextureCanvas';

export interface HatchProps {
  /** Muted fill under the stripes; defaults to the token's own base colour. */
  readonly baseColor?: string;
}

/**
 * `tex.hatch`: 135° light stripes on a muted fill (photo placeholders, loading skeletons). Drawn
 * once per block size as a plain image, so a hatched block costs no GL surface; a build without
 * Skia's raster surface draws it live.
 */
export function Hatch({ baseColor }: HatchProps) {
  const { angle, color, width: stripe, gap, base } = TEXTURE.hatch;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== size?.width || height !== size.height) setSize({ width, height });
  };
  const uri =
    size === null || size.width <= 0 || size.height <= 0
      ? null
      : hatchImage({
          width: size.width,
          height: size.height,
          angleDeg: angle,
          stripePt: stripe,
          gapPt: gap,
          color,
          base: baseColor ?? base,
          scale: PixelRatio.get(),
        });
  if (size !== null && uri === null) {
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
  return (
    <View
      testID="texture-hatch"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
    >
      {uri === null ? null : (
        <Image source={{ uri }} fadeDuration={0} style={StyleSheet.absoluteFill} />
      )}
    </View>
  );
}
