/**
 * "Day trips from {city}" on Explore in a trip: one card per linked area with how long it takes to
 * get there and by what, a tag for its length and one for the day it is already on. A card opens
 * the area's page.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Row } from '@/ui/layout/Row';
import { PressScale } from '@/ui/press/PressScale';
import { PlaceThumb } from '@/ui/planning/place-thumb';
import { PlanningTag } from '@/ui/planning/planning-tag';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { categoryIcon } from '../category';
import * as copy from './copy';
import type { DayTripCard } from './day-trips-model';

export interface DayTripsRowProps {
  readonly city: string;
  readonly cards: readonly DayTripCard[];
  readonly onOpen: (card: DayTripCard) => void;
  /** The colour of the tag that names the day (the guide's). */
  readonly accent: string;
}

const THUMB = 72;

const useStyles = makeStyles((t) => ({
  section: { gap: t.space['10'], paddingHorizontal: t.size.gutter },
  card: {
    flexDirection: 'row',
    gap: t.space['12'],
    padding: t.space['12'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.base,
    borderWidth: 2,
    borderColor: t.semantic.bg.raised,
  },
  body: { flex: 1, minWidth: 0, gap: t.space['4'] },
  tags: { flexWrap: 'wrap', marginTop: t.space['4'] },
}));

export function DayTripsRow({ city, cards, onOpen, accent }: DayTripsRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  const locale = i18n.locale;
  return (
    <View style={styles.section} testID="explore-day-trips">
      <Text variant="eyebrow" numberOfLines={2} singleLine={false}>
        {upper(copy.sectionTitle(city), locale)}
      </Text>
      {cards.map((card, index) => {
        const length = card.length === null ? null : copy.lengthTag(card.length);
        const onDay = card.dayNo === null ? null : copy.onDayTag(card.dayNo);
        return (
          <PressScale
            key={card.id}
            onPress={() => onOpen(card)}
            accessibilityRole="button"
            accessibilityLabel={[card.name, card.travel, length, onDay]
              .filter((part) => part !== null)
              .join(', ')}
            testID={`explore-day-trip-${String(index)}`}
          >
            {/* The place card's own frame, with the tags inside it under the travel line. */}
            <View style={styles.card}>
              <PlaceThumb icon={categoryIcon('sight')} size={THUMB} />
              <View style={styles.body}>
                <Text variant="h3" numberOfLines={2}>
                  {card.name}
                </Text>
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {card.travel}
                </Text>
                {length === null && onDay === null ? null : (
                  <Row gap="6" style={styles.tags}>
                    {length === null ? null : <PlanningTag label={upper(length, locale)} />}
                    {onDay === null ? null : (
                      <PlanningTag
                        label={upper(onDay, locale)}
                        color={accent}
                        testID={`explore-day-trip-on-day-${String(index)}`}
                      />
                    )}
                  </Row>
                )}
              </View>
            </View>
          </PressScale>
        );
      })}
    </View>
  );
}
