/**
 * What Foursquare adds to a place's page, under the guide's tip: the rating, more photos, up to
 * three visitors' tips, call and website rows, and the "Powered by Foursquare" line its terms ask
 * for. Each block is left out when it has nothing; the photos load straight from Foursquare and are
 * never saved on the phone.
 */
import { useLingui } from '@lingui/react/macro';
import { Image, Linking, ScrollView, View } from 'react-native';

import { ListCard } from '@/ui/cards/ListCard';
import { TextLink } from '@/ui/buttons/TextLink';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Icon } from '@/ui/icons/Icon';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { LiveDetails } from '../place-live';

const STRIP_HEIGHT = 96;

const useStyles = makeStyles((t) => ({
  block: { gap: t.space['8'] },
  strip: { gap: t.space['8'] },
  photo: {
    height: STRIP_HEIGHT,
    borderRadius: t.radius.sm,
    backgroundColor: t.semantic.bg.raised,
  },
  tip: {
    borderStartWidth: 2,
    borderStartColor: t.semantic.text.secondary,
    paddingStart: t.space['10'],
  },
}));

/** A dialable `tel:` link from a written number. */
function telLink(phone: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a URL scheme, never copy.
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function open(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}

function hostOf(url: string): string {
  const match = /^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(url);
  return match?.[1] ?? url;
}

export function PlaceLiveDetails(details: LiveDetails) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const { rating, photos, tips, phone, website, attribution } = details;
  return (
    <View style={{ gap: theme.space['16'] }} testID="explore-place-live">
      {rating === null ? null : (
        <InfoPill
          icon="star"
          variant="outline"
          accessibilityLabel={t({
            id: 'explore.place.ratingLabel',
            message: `Rated ${rating.toFixed(1)} out of 10`,
          })}
          testID="explore-place-rating"
        >
          {t({ id: 'explore.place.rating', message: `${rating.toFixed(1)} / 10` })}
        </InfoPill>
      )}
      {photos.length === 0 ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
          testID="explore-place-photos"
        >
          {photos.map((photo) => (
            <Image
              key={photo.url}
              source={{ uri: photo.url }}
              style={[styles.photo, { width: (STRIP_HEIGHT * photo.width) / photo.height }]}
              accessibilityIgnoresInvertColors
            />
          ))}
        </ScrollView>
      )}
      {tips.length === 0 ? null : (
        <View style={styles.block} testID="explore-place-tips">
          <Text variant="label" color={theme.semantic.text.secondary}>
            {t({ id: 'explore.place.visitorTips', message: 'What visitors say' })}
          </Text>
          {tips.map((tip) => (
            <View key={`${tip.createdAt}-${tip.text}`} style={styles.tip}>
              <Text variant="body" singleLine={false}>
                {tip.text}
              </Text>
            </View>
          ))}
        </View>
      )}
      {phone === null ? null : (
        <ListCard
          title={t({ id: 'explore.place.call', message: 'Call' })}
          subtitle={phone}
          leading={<Icon name="chat" size={24} decorative />}
          onPress={() => open(telLink(phone))}
          testID="explore-place-phone"
        />
      )}
      {website === null ? null : (
        <ListCard
          title={t({ id: 'explore.place.website', message: 'Website' })}
          subtitle={hostOf(website)}
          leading={<Icon name="arrow" size={24} decorative />}
          onPress={() => open(website)}
          testID="explore-place-website"
        />
      )}
      {attribution === null ? null : (
        <View style={{ alignItems: 'flex-start' }}>
          <TextLink
            label={t({
              id: 'explore.place.poweredBy',
              message: `Powered by ${attribution.name}`,
            })}
            onPress={() => open(attribution.url)}
            testID="explore-place-attribution"
          />
        </View>
      )}
    </View>
  );
}
