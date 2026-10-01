/**
 * The cards along the bottom of the map, one per place in view: the photo slot, the name, a line
 * of facts, the crewmates keen on it and, when it is in the plan, the day chip. Swiping settles on
 * a card and tells the map which place that is; tapping a card opens the place. A sponsored card
 * is the same card with its tag and the "why" link.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef } from 'react';
import {
  FlatList,
  Pressable,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Icon } from '@/ui/icons/Icon';
import { AvatarStack, type StackMember } from '@/ui/people/AvatarStack';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { Hatch } from '@/ui/textures/hatch';
import { makeStyles, useTheme } from '@/ui/theme';

import { categoryIcon } from '../category';
import { SponsoredTag, WhySponsoredLink } from './sponsored-card';

const PHOTO = 84;
const PEEK = 56;

export interface CarouselCard {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  /** Already worded: "Temple · open now". */
  readonly meta: string;
  readonly keen: readonly StackMember[];
  /** Already worded: "Day 2 · 06:00". */
  readonly planChip: string | null;
  readonly sponsored?: { readonly onWhy: () => void } | undefined;
}

export interface PlaceCarouselProps {
  readonly cards: readonly CarouselCard[];
  readonly selectedId: string | null;
  /** The card the swipe settled on. */
  readonly onSettle: (id: string) => void;
  readonly onOpen: (card: CarouselCard) => void;
}

const useStyles = makeStyles((t) => ({
  card: {
    flexDirection: 'row',
    gap: t.space['12'],
    padding: t.space['10'],
    borderRadius: t.radius.cardBig,
    backgroundColor: t.semantic.bg.raised,
  },
  photo: {
    width: PHOTO,
    height: PHOTO,
    borderRadius: t.radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: t.space['4'], justifyContent: 'center' },
  chip: {
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['8'],
    paddingVertical: t.space['2'],
    backgroundColor: t.semantic.action.primary,
  },
}));

export function PlaceCarousel({ cards, selectedId, onSettle, onOpen }: PlaceCarouselProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { i18n } = useLingui();
  const list = useRef<FlatList<CarouselCard>>(null);
  const gap = theme.space['10'];
  const cardWidth = width - theme.size.gutter - PEEK;
  const step = cardWidth + gap;
  const settled = useRef<string | null>(null);

  // A pin tapped on the map brings its card into view.
  useEffect(() => {
    if (selectedId === null || settled.current === selectedId) return;
    const index = cards.findIndex((card) => card.id === selectedId);
    if (index >= 0) list.current?.scrollToOffset({ offset: index * step, animated: true });
  }, [cards, selectedId, step]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / step);
    const card = cards[Math.min(cards.length - 1, Math.max(0, index))];
    if (card === undefined) return;
    settled.current = card.id;
    onSettle(card.id);
  };

  return (
    <FlatList
      ref={list}
      horizontal
      data={cards}
      keyExtractor={(card) => card.id}
      showsHorizontalScrollIndicator={false}
      snapToInterval={step}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: theme.size.gutter, gap }}
      onMomentumScrollEnd={settle}
      getItemLayout={(_, index) => ({ length: step, offset: step * index, index })}
      testID="explore-map-carousel"
      renderItem={({ item, index }) => (
        <View style={{ width: cardWidth }}>
          <Pressable
            style={styles.card}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.meta}`}
            onPress={() => onOpen(item)}
            testID={`explore-map-card-${String(index)}`}
          >
            <View style={styles.photo}>
              <Hatch />
              <Icon
                name={categoryIcon(item.category)}
                size={30}
                color={theme.semantic.text.secondary}
                decorative
              />
              {item.sponsored === undefined ? null : <SponsoredTag />}
            </View>
            <View style={styles.copy}>
              <Text variant="title" numberOfLines={2}>
                {upper(item.name, i18n.locale)}
              </Text>
              <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={2}>
                {item.meta}
              </Text>
              {item.keen.length === 0 && item.planChip === null ? null : (
                <Row gap="8" align="center" wrap>
                  {item.keen.length === 0 ? null : (
                    <AvatarStack members={item.keen} max={3} size="sm" />
                  )}
                  {item.planChip === null ? null : (
                    <View style={styles.chip}>
                      <Text variant="label" color={theme.semantic.text.onAccent}>
                        {upper(item.planChip, i18n.locale)}
                      </Text>
                    </View>
                  )}
                </Row>
              )}
            </View>
          </Pressable>
          {item.sponsored === undefined ? null : (
            <WhySponsoredLink onPress={item.sponsored.onWhy} />
          )}
        </View>
      )}
    />
  );
}
