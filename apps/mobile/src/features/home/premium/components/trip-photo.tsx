/**
 * A destination's editorial photo, full colour (premium never duotones), filling its parent. The
 * still is the smallest file that covers the box and is kept on the phone so it draws offline next
 * time. Nothing renders while there is no photo: the parent's own fill shows.
 */
import { useEffect, useState } from 'react';
import { Image, PixelRatio, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { heroAt, useDestinationMedia } from '@/data/media/use-subject-media';
import { saveMediaFile, savedStillUri } from '@/lib/media/media-files';
import { pickBySize } from '@/lib/media/variants';

export interface TripPhotoProps {
  /** The destination's slug; null draws nothing. */
  readonly slug: string | null;
  /** Which of the destination's photos (collages show a second one). @default 0 */
  readonly index?: number;
  readonly testID?: string;
}

export function useHasTripPhoto(slug: string | null): boolean {
  return useDestinationMedia(slug).items.length > 0;
}

export function TripPhoto({ slug, index = 0, testID }: TripPhotoProps) {
  const media = heroAt(useDestinationMedia(slug).items, index);
  const [width, setWidth] = useState(0);
  const still =
    media === null || width === 0 ? undefined : pickBySize(media.images, width * PixelRatio.get());
  const saved = media !== null && still !== undefined ? savedStillUri(media, still.url) : null;
  useEffect(() => {
    if (media !== null && still !== undefined && saved === null) {
      void saveMediaFile(media.id, still.url);
    }
  }, [media, still, saved]);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={onLayout}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      {still === undefined ? null : (
        <Image
          source={{ uri: saved ?? still.url }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
    </View>
  );
}
