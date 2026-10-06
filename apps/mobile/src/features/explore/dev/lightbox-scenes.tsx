/**
 * Lab scene for the full-screen media viewer: a strip of four stock photos, each opening the viewer
 * on itself, with a caption on some and a credit on all, so the counter, both lines and the paging
 * can be reviewed without a place or a chat.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';
import { Image, View } from 'react-native';

import type { LightboxItem } from '@/ui/media/lightbox/lightbox-model';
import { LightboxThumb, useLightbox } from '@/ui/media/lightbox/use-lightbox';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

// Staging stock photos of Đà Nẵng: Wikimedia refuses Android's image loader.
const STOCK = 'https://media.staging.critterpass.app/c/media';
const PHOTOS: readonly LightboxItem[] = [
  { id: '01a0f4a2-e2d1-7495-adc0-1b6fc321be89', caption: 'Mỹ Khê beach before the crowd arrives.' },
  { id: '01a0f4a2-e2c8-7be5-a86b-7c1df14c1f4b', caption: undefined },
  { id: '01a0f4a2-e2cd-76ae-bac3-790439413f56', caption: 'The Dragon Bridge from the east bank.' },
  { id: '01a0f4a2-e2d4-7bb3-8b51-0913d642c105', caption: undefined },
].map(({ id, caption }, index) => ({
  key: id,
  kind: 'image',
  uri: `${STOCK}/${id}/1242.webp`,
  caption,
  credit: index % 2 === 0 ? 'Linh Tran · Unsplash' : 'Foursquare',
}));

const THUMB = 96;

function LightboxScene() {
  const theme = useTheme();
  const lightbox = useLightbox(PHOTOS, 'lab-lightbox');
  return (
    <Scaffold testID="lab-lightbox-scene">
      <View style={{ padding: theme.size.gutter, gap: theme.space['16'] }}>
        <Text variant="h2">Media viewer</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space['8'] }}>
          {PHOTOS.map((photo, index) => (
            <LightboxThumb
              key={photo.key}
              position={index + 1}
              total={PHOTOS.length}
              onPress={() => lightbox.open(photo.key)}
              testID={`lab-lightbox-thumb-${index}`}
            >
              <Image
                source={{ uri: photo.uri ?? '' }}
                style={{
                  width: THUMB,
                  height: THUMB,
                  borderRadius: theme.radius.sm,
                  backgroundColor: theme.semantic.bg.raised,
                }}
                accessibilityIgnoresInvertColors
              />
            </LightboxThumb>
          ))}
        </View>
      </View>
      {lightbox.viewer}
    </Scaffold>
  );
}

export const LIGHTBOX_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'media-lightbox': () => <LightboxScene />,
};
