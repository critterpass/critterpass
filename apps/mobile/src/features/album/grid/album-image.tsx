/**
 * One album picture wherever it is shown (a grid tile, the postcard's front, the photo chooser):
 * the picture over its placeholder colour once its link has arrived, and a short line when it
 * could not be loaded. It is asked for again by itself when the phone is back online.
 */
import { useLingui } from '@lingui/react/macro';
import { Image, StyleSheet, View } from 'react-native';

import { Text } from '@/ui/premium';

import { useAlbumPicture } from './album-media';

const styles = StyleSheet.create({
  failed: { alignItems: 'center', justifyContent: 'center', padding: 8 },
});

export interface AlbumImageProps {
  readonly mediaKey: string | null;
  /** A small thumbnail has no room for the line; its colour alone stands in. @default true */
  readonly failureLine?: boolean;
  readonly testID?: string;
}

/** Fills its parent, which gives the size, the corners and the placeholder colour. */
export function AlbumImage({ mediaKey, failureLine = true, testID }: AlbumImageProps) {
  const { t } = useLingui();
  const picture = useAlbumPicture(mediaKey);
  if (picture.url !== null) {
    return (
      <Image
        source={{ uri: picture.url }}
        style={StyleSheet.absoluteFill}
        onError={picture.onError}
        accessibilityIgnoresInvertColors
        {...(testID === undefined ? {} : { testID })}
      />
    );
  }
  if (!picture.failed || !failureLine) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.failed]} pointerEvents="none">
      <Text variant="caption" tone="onInk" singleLine={false} numberOfLines={2} align="center">
        {t({ id: 'album.image.failed', message: "Couldn't load" })}
      </Text>
    </View>
  );
}
