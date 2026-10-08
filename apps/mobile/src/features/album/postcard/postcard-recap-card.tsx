/**
 * Card 8, the postcard (3m-9): the front is the album's top pick (the guide's colour when there are
 * no photos), the back carries the note the guide wrote from the trip's highlights, stamped with this
 * trip's guide, and turns over with a small bounce. "Send it home" opens the composer, where the
 * traveller can rewrite the note, change the photo and format, send it to the crew and mail it;
 * the link under it opens the crew's album. It keeps clear of the story's bars and
 * header above and its narration line below.
 */
import { router } from 'expo-router';
import { View } from 'react-native';

import { useAlbum } from '../data/use-album';
import { AlbumMediaProvider } from '../grid/album-media';
import { postcardCardCopy } from './postcard-card-copy';
import { PostcardPair } from './postcard-pair';
import { albumRoutes } from '../routes';
import { albumHttp } from '../upload/device-upload';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Stack } from '@/ui/layout/Stack';
import type { GuideId } from '@/ui/people/GuideLine';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

/**
 * The room every card of the recap story keeps: its bars and header above, its narration line
 * below. The story's own card frame belongs to the recap area, so this card keeps the same room
 * itself.
 */
const STORY_CHROME_PT = 100;
const STORY_FOOT_PT = 96;

const useStyles = makeStyles((t) => ({
  card: {
    flex: 1,
    paddingTop: STORY_CHROME_PT,
    paddingBottom: STORY_FOOT_PT,
    paddingHorizontal: t.size.gutter,
    gap: t.space['16'],
    backgroundColor: t.semantic.bg.base,
  },
}));

export interface PostcardCardProps {
  readonly tripId: string;
  readonly guide: GuideId;
  readonly place: string;
  /** The guide's note from the recap highlights; null before it has written one. */
  readonly note: string | null;
}

export function PostcardCard({ tripId, guide, place, note }: PostcardCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const album = useAlbum(tripId);
  const copy = postcardCardCopy();
  const lead = album.photos.find((photo) => photo.isPick) ?? album.photos[0] ?? null;
  const me = album.people.find((person) => person.id === album.me);
  return (
    <AlbumMediaProvider http={albumHttp}>
      <View style={styles.card} testID="recap-card-postcard">
        <Stack gap="4">
          <Text variant="eyebrow" color={theme.color.yellow}>
            {copy.eyebrow}
          </Text>
          <Text variant="h1" accessibilityRole="header">
            {copy.title}
          </Text>
        </Stack>
        <PostcardPair
          format="classic"
          photoKey={lead?.displayKey ?? lead?.thumbKey ?? null}
          photoCaption={null}
          place={place}
          note={note ?? ''}
          signature={(me?.name ?? '').slice(0, 1).toUpperCase()}
          guide={guide}
        />
        <PillButton
          label={copy.send}
          onPress={() => router.push(albumRoutes.postcard(tripId))}
          block
          size="lg"
          testID="recap-postcard-open"
        />
        <TextLink
          label={copy.album}
          onPress={() => router.push(albumRoutes.album(tripId))}
          testID="recap-postcard-album"
        />
      </View>
    </AlbumMediaProvider>
  );
}
