/**
 * A licensed photo filling its parent, in its own colours (premium never duotones): the smallest
 * still that covers the box, kept on the phone so it draws offline next time, fading in once it
 * has loaded (at once under Reduce Motion) over the parent's own fill, which also stays when there
 * is no photo or the file fails. When the licence asks for it, the credit sits in a corner on a dark
 * plate that reads over any picture: one line, the author alone when the whole credit is too long.
 */
/* eslint-disable critterpass/no-literal-style, lingui/no-unlocalized-strings -- the plate's paint over pictures, which the premium tokens do not carry yet */
import { useEffect, useState } from 'react';
import { Image, PixelRatio, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { creditFor } from '@/lib/media/credit-line';
import { saveMediaFile, savedStillUri } from '@/lib/media/media-files';
import { pickBySize, type MediaView } from '@/lib/media/variants';

import { usePremiumReducedMotion } from '../motion/reduced-motion';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface PhotoLayerProps {
  /** The photo; none draws nothing (the parent's fill shows). */
  readonly media: MediaView | null | undefined;
  /** Low data: the smallest still that half covers the box. */
  readonly lowData?: boolean;
  /** The corner the licence credit sits in. @default 'bottom' */
  readonly creditAt?: 'top' | 'bottom';
  /** How far the credit sits from that edge (more where something overlaps it). @default 8 */
  readonly creditInset?: number;
  /** The side the credit starts from. @default 'end' */
  readonly creditAlign?: 'start' | 'end';
  readonly testID?: string;
}

const PLATE = 'rgba(0,0,0,.45)';
const ON_PLATE = '#ffffff';
const FADE_MS = 200;
/** A low-data slot loads a smaller still. */
const LOW_DATA_SCALE = 0.5;

export function PhotoLayer({
  media,
  lowData = false,
  creditAt = 'bottom',
  creditInset = 8,
  creditAlign = 'end',
  testID,
}: PhotoLayerProps) {
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const [width, setWidth] = useState<number | null>(null);
  const shown = useSharedValue(0);
  const pixels = (width ?? 0) * PixelRatio.get() * (lowData ? LOW_DATA_SCALE : 1);
  const still =
    media === null || media === undefined || width === null
      ? undefined
      : pickBySize(media.images, pixels);
  const saved =
    media === null || media === undefined || still === undefined
      ? null
      : savedStillUri(media, still.url);
  useEffect(() => {
    // Save what shows, so it draws offline next time.
    if (media && still !== undefined && saved === null) void saveMediaFile(media.id, still.url);
  }, [media, still, saved]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get() }));
  if (media === null || media === undefined) return null;
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return (
    <>
      <View
        style={StyleSheet.absoluteFill}
        onLayout={onLayout}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={testID}
      >
        {still === undefined ? null : (
          <Animated.View style={[StyleSheet.absoluteFill, fade]}>
            <Image
              source={{ uri: saved ?? still.url }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onLoad={() => shown.set(reduced ? 1 : withTiming(1, { duration: FADE_MS }))}
            />
          </Animated.View>
        )}
      </View>
      {media.attribution_required ? (
        <View
          pointerEvents="none"
          style={[
            styles.creditLine,
            {
              left: th.space.gap12,
              right: th.space.gap12,
              justifyContent: creditAlign === 'start' ? 'flex-start' : 'flex-end',
            },
            creditAt === 'top' ? { top: creditInset } : { bottom: creditInset },
          ]}
        >
          <Text
            variant="caption"
            color={ON_PLATE}
            numberOfLines={1}
            style={[styles.credit, { paddingHorizontal: th.space.gap6 }]}
            testID={testID === undefined ? undefined : `${testID}-credit`}
          >
            {creditFor(media.credit, width)}
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  creditLine: { position: 'absolute', flexDirection: 'row' },
  credit: { flexShrink: 1, backgroundColor: PLATE, borderRadius: 6, overflow: 'hidden' },
});
