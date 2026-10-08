/**
 * The header's media (3k-1): the destination's photo from the very top of the screen to the
 * header's bottom edge, in the dark duotone of the trip's colour (the media layer's own treatment,
 * which carries the ink the labels and the destination need), under the header's scrim: clear down
 * to the middle of the destination, solid at the bottom edge, so the photo reads as a photo and
 * ends in the page. A still, never a loop: the layer draws a loop above its own ink, where the
 * labels would lose their contrast. No media draws nothing: the header is plain ink, as designed.
 */
import type { MediaAsset } from '@cp/domain';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MediaLayer } from '@/ui/media/MediaLayer';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { scrimStops } from './hero-layout';

export interface HeroBackdropProps {
  readonly media: MediaAsset | null;
  readonly colour: string;
  readonly lowData: boolean;
  /** Where the destination starts, from the header's top. */
  readonly titleY: number;
}

const useStyles = makeStyles((th) => ({
  credit: { position: 'absolute', end: th.size.gutter, bottom: th.space['4'] },
}));

/** `#rrggbb` with an alpha channel. */
function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/** Memoised: the header above it redraws each second for its countdown, the photo does not. */
export const HeroBackdrop = memo(function HeroBackdrop({
  media,
  colour,
  lowData,
  titleY,
}: HeroBackdropProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  if (media === null) return null;
  const ink = theme.color.ink['850'];
  const stops = scrimStops({ height: size?.height ?? 0, titleY });
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size?.width || height !== size.height) setSize({ width, height });
      }}
    >
      <MediaLayer
        media={media}
        surface="dark"
        accent={colour}
        motion="still"
        lowData={lowData}
        testID="trip-hub-hero-media"
      />
      {size === null ? null : (
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={size.width} height={size.height}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, size.height)}
              colors={stops.alphas.map((alpha) => withAlpha(ink, alpha))}
              positions={[...stops.positions]}
            />
          </Rect>
        </Canvas>
      )}
      {/* The scrim covers the layer's own credit line; the licence's credit sits on top of it. */}
      {media.attribution_required ? (
        <Text
          variant="caption"
          color={theme.semantic.text.secondary}
          numberOfLines={1}
          style={styles.credit}
          testID="trip-hub-hero-credit"
        >
          {media.credit}
        </Text>
      ) : null}
    </View>
  );
});
