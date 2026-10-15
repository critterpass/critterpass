/**
 * The recap story's last card in the premium look (8.14): "Last card / Send it home", the postcard
 * with the album's top pick on its front and the guide's note on its back, Send it home (the
 * composer) and the link to the crew's album.
 */
import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import { useAlbum } from '../data/use-album';
import { AlbumMediaProvider } from '../grid/album-media';
import { postcardCardCopy } from '../postcard/postcard-card-copy';
import type { PostcardCardProps } from '../postcard/postcard-look';
import { albumRoutes } from '../routes';
import { albumHttp } from '../upload/device-upload';
import { PostcardCards } from './postcard-cards';

export function PremiumPostcardCard({ tripId, guide, place, note }: PostcardCardProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const album = useAlbum(tripId);
  const copy = postcardCardCopy();
  const lead = album.photos.find((photo) => photo.isPick) ?? album.photos[0] ?? null;
  const me = album.people.find((person) => person.id === album.me);
  const compose = () => router.push(albumRoutes.postcard(tripId));
  return (
    <AlbumMediaProvider http={albumHttp}>
      <View
        style={{
          flex: 1,
          gap: 16,
          paddingTop: insets.top + 96,
          paddingBottom: insets.bottom + 110,
          paddingHorizontal: 24,
          backgroundColor: th.color.ground,
        }}
        testID="recap-card-postcard"
      >
        <View>
          <Text variant="label" tone="muted">
            {copy.eyebrow}
          </Text>
          <Text variant="largeTitle" accessibilityRole="header">
            {copy.title}
          </Text>
        </View>
        <PostcardCards
          format="classic"
          photoKey={lead?.displayKey ?? lead?.thumbKey ?? null}
          photoCaption={null}
          place={place}
          note={note ?? ''}
          signature={(me?.name ?? '').slice(0, 1).toUpperCase()}
          guide={guide}
          onPhoto={compose}
          onNote={compose}
        />
        <Button label={copy.send} onPress={compose} testID="recap-postcard-open" />
        <View style={{ alignItems: 'center' }}>
          <TextButton
            align="center"
            label={copy.album}
            onPress={() => router.push(albumRoutes.album(tripId))}
            testID="recap-postcard-album"
          />
        </View>
      </View>
    </AlbumMediaProvider>
  );
}
