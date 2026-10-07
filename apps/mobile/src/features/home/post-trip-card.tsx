/**
 * Home's card for two weeks after a trip's last day (undesigned, logged in
 * docs/undesigned-states.md): "HOW'D IT GO?", "{PLACE} RECAP" and one pill, with the trip's guide
 * over the corner; it opens the recap. It is the next-up card's layout (3b-2) with a sentence for
 * a title: the title starts under the sticker, across the card's whole width, in the display face
 * sized for two lines, and shrinks until the whole sentence is on them. A place name is never cut
 * ("NHÌN LẠI THÀNH PHỐ HỒ CHÍ MINH").
 */
import type { HomeTripInput } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { guideOr, guideTone } from './format';
import { POST_TRIP_TITLE_LINES, POST_TRIP_TITLE_MIN_SIZE } from './post-trip-title';
import { homeRoutes } from './routes';

/** The guide over the card's corner, the size the next-up card draws it. */
const STICKER = 96;

const useStyles = makeStyles((t) => ({
  sticker: { position: 'absolute', top: t.space['8'], end: t.space['8'] },
  // The title starts below the sticker, so it has the card's whole width.
  title: { marginTop: STICKER - t.space['32'] },
}));

export function PostTripCard({ trip }: { readonly trip: HomeTripInput }) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const guide = guideOr(trip.guideId);
  const sticker = guideSticker(guide);
  const place = trip.destinationName ?? t({ id: 'home.postTrip.fallback', message: 'Trip' });
  const href = homeRoutes.recap(trip.id);
  const eyebrow = upper(t({ id: 'home.postTrip.eyebrow', message: "How'd it go?" }), locale);
  const title = upper(t({ id: 'home.postTrip.title', message: `${place} recap` }), locale);
  return (
    <Card
      testID="home-post-trip"
      tone={guideTone(guide)}
      halftone
      radius="cardBig"
      accessibilityLabel={`${eyebrow}, ${title}`}
      {...(href === undefined ? {} : { onPress: () => router.push(href) })}
    >
      <View style={styles.sticker} pointerEvents="none">
        <Sticker kind={sticker.kind} name={sticker.name} size={STICKER} pose="hop" />
      </View>
      <Stack gap="8">
        <Text variant="eyebrow">{eyebrow}</Text>
        <Text
          variant="displayXl"
          autoFit
          autoFitMinSize={POST_TRIP_TITLE_MIN_SIZE}
          numberOfLines={POST_TRIP_TITLE_LINES}
          style={styles.title}
          testID="home-post-trip-title"
        >
          {title}
        </Text>
        <Row gap="8" wrap>
          <InfoPill variant="outline">
            {upper(t({ id: 'home.postTrip.open', message: 'See the recap' }), locale)}
          </InfoPill>
        </Row>
      </Stack>
    </Card>
  );
}
