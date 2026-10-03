/**
 * The guide's first-timer picks: a row of cards to swipe through, each a photo (or the place's
 * doodle on hatching while there is no licensed photo) over its name. Tapping one opens the place.
 * A sponsored card is the same card with its tag and the "why" link under it.
 */
import type { MediaAsset } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable, ScrollView, View } from 'react-native';

import { Icon } from '@/ui/icons/Icon';
import { MediaLayer } from '@/ui/media/MediaLayer';
import { Text } from '@/ui/text/Text';
import { Hatch } from '@/ui/textures/hatch';
import { makeStyles, useTheme } from '@/ui/theme';

import { categoryIcon, categoryLabel } from '../category';
import { GenericPhotoLabel } from './generic-photo-label';
import { SponsoredTag, WhySponsoredLink } from './sponsored-card';

const CARD_WIDTH = 136;
const PHOTO_HEIGHT = 76;

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: t.space['8'], paddingHorizontal: t.size.gutter },
  card: {
    width: CARD_WIDTH,
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    overflow: 'hidden',
  },
  photo: { height: PHOTO_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  name: { padding: t.space['10'], paddingBottom: t.space['14'] },
}));

export interface PickCard {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly photo: MediaAsset | null;
  /** A paid-for card: labelled, with the way to ask why it is shown. */
  readonly sponsored?: { readonly onWhy: () => void } | undefined;
}

export interface PicksRowProps {
  readonly picks: readonly PickCard[];
  /** Absent while the place page is not in the app: the cards then take no tap. */
  readonly onOpen?: ((pick: PickCard) => void) | undefined;
  /** The colour a pick's photo is tinted with (the guide's). */
  readonly accent: string;
}

export function PicksRow({ picks, onOpen, accent }: PicksRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="explore-picks">
      <View style={styles.row}>
        {picks.map((pick, index) => (
          <View key={pick.id} style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                pick.sponsored === undefined
                  ? `${pick.name}, ${categoryLabel(pick.category)}`
                  : t({
                      id: 'explore.sponsored.cardLabel',
                      message: `Sponsored: ${pick.name}, ${categoryLabel(pick.category)}`,
                    })
              }
              disabled={onOpen === undefined}
              onPress={() => onOpen?.(pick)}
              testID={`explore-pick-${String(index)}`}
            >
              <View style={styles.photo}>
                <Hatch />
                <MediaLayer media={pick.photo} surface="dark" accent={accent} dots={false} />
                <GenericPhotoLabel photo={pick.photo} />
                {pick.photo === null ? (
                  <Icon
                    name={categoryIcon(pick.category)}
                    size={28}
                    color={theme.semantic.text.secondary}
                    decorative
                  />
                ) : null}
                {pick.sponsored === undefined ? null : <SponsoredTag />}
              </View>
              <View style={styles.name}>
                <Text variant="title" numberOfLines={3}>
                  {upper(pick.name, i18n.locale)}
                </Text>
              </View>
            </Pressable>
            {pick.sponsored === undefined ? null : (
              <WhySponsoredLink onPress={pick.sponsored.onWhy} />
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
