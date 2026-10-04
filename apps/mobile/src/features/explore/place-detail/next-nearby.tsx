/**
 * NEXT, NEARBY (7e-2): curated places by the drive from here, so it doubles as what to do after;
 * each card opens the place, and BY TOKEK says who ordered them.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { Pressable, ScrollView, View } from 'react-native';

import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { Hatch } from '@/ui/textures/hatch';
import { makeStyles, useTheme } from '@/ui/theme';

import type { GuideFacts } from '../format';
import type { PlaceRef } from './context';
import { durationText } from './model';

const CARD_WIDTH = 132;

const useStyles = makeStyles((t) => ({
  card: {
    width: CARD_WIDTH,
    borderRadius: t.radius.md,
    overflow: 'hidden',
    backgroundColor: t.semantic.bg.raised,
  },
  art: { height: 64, overflow: 'hidden' },
  text: { padding: t.space['8'], gap: t.space['2'] },
  row: { gap: t.space['8'], paddingEnd: t.size.gutter },
}));

export function NextNearby({
  guide,
  places,
  onPlace,
}: {
  readonly guide: GuideFacts;
  readonly places: readonly PlaceRef[];
  readonly onPlace: (poiId: string) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  if (places.length === 0) return null;
  const locale = i18n.locale;
  return (
    <View style={{ gap: theme.space['8'] }} testID="place-detail-nearby">
      <Row justify="space-between" align="center">
        <Text variant="eyebrow" color={theme.semantic.text.secondary}>
          {upper(t({ id: 'explore.detail.nearby', message: 'Next, nearby' }), locale)}
        </Text>
        <Text variant="label" color={guide.colour}>
          {upper(t({ id: 'explore.detail.nearbyBy', message: `By ${guide.name}` }), locale)}
        </Text>
      </Row>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {places.map((place) => {
          const duration = durationText(place.minutes);
          const on = t({ id: 'explore.detail.minOn', message: `${duration} on` });
          return (
            <Pressable
              key={place.poi_id}
              style={styles.card}
              onPress={() => onPlace(place.poi_id)}
              accessibilityRole="button"
              accessibilityLabel={`${place.name}, ${on}`}
              testID={`place-detail-nearby-${place.poi_id}`}
            >
              <View style={styles.art}>
                <Hatch />
              </View>
              <View style={styles.text}>
                <Text variant="title">{upper(place.name, locale)}</Text>
                <Text variant="label" color={guide.colour}>
                  {upper(on, locale)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
