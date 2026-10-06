/**
 * "Day trips from {city}" on Explore in a trip: one card per linked area with how long it takes to
 * get there and by what, a tag for its length and one for the day it is already on. A card opens
 * the area's page.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Row } from '@/ui/layout/Row';
import { PlaceCard } from '@/ui/planning/place-card';
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

const useStyles = makeStyles((t) => ({
  section: { gap: t.space['10'], paddingHorizontal: t.size.gutter },
  card: { gap: t.space['6'] },
  tags: { paddingStart: t.space['4'] },
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
      {cards.map((card, index) => (
        <View key={card.id} style={styles.card}>
          <PlaceCard
            title={card.name}
            description={card.travel}
            icon={categoryIcon('sight')}
            onPress={() => onOpen(card)}
            testID={`explore-day-trip-${String(index)}`}
          />
          {card.length === null && card.dayNo === null ? null : (
            <Row gap="6" style={styles.tags}>
              {card.length === null ? null : (
                <PlanningTag label={upper(copy.lengthTag(card.length), locale)} />
              )}
              {card.dayNo === null ? null : (
                <PlanningTag
                  label={upper(copy.onDayTag(card.dayNo), locale)}
                  color={accent ?? theme.semantic.action.primary}
                  testID={`explore-day-trip-on-day-${String(index)}`}
                />
              )}
            </Row>
          )}
        </View>
      ))}
    </View>
  );
}
