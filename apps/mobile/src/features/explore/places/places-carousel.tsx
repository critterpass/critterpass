/**
 * The cards under a picked place (7c-2): "1 OF 9 IN VIEW · NEAREST FIRST" over a row of place cards,
 * the picked place first and then the places in view nearest to it. Swiping settles on a card and
 * moves the map's label there; a card opens the place, its + opens Add to plan.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef } from 'react';
import {
  FlatList,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { screenCredits, type PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import type { StackMember } from '@/ui/people/AvatarStack';
import { PhotoCredit, PlaceCard, PlanningTag, type FitTone } from '@/ui/planning';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { categoryIcon } from '../category';
import { addLabel, carouselCount, nextDoorLabel } from './places-copy';

const PEEK = 56;

export interface CarouselEntry {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly facts?: string | undefined;
  readonly savers: readonly StackMember[];
  readonly fit?: { readonly text: string; readonly tone: FitTone } | undefined;
  readonly nextDoor: boolean;
  /** Already on a day of the plan: the card shows the day and has no +. */
  readonly planned?: boolean | undefined;
}

export interface PlacesCarouselProps {
  readonly entries: readonly CarouselEntry[];
  /** The cards' photos by place id, as they arrive. */
  readonly photos?: PlaceTilePhotos | undefined;
  readonly focusedId: string | null;
  readonly onSettle: (id: string) => void;
  readonly onOpen: (id: string) => void;
  /** Absent while Add to plan is not on this phone. */
  readonly onAdd?: ((id: string) => void) | undefined;
}

const useStyles = makeStyles((t) => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: t.size.gutter,
    marginBottom: t.space['8'],
    gap: t.space['12'],
  },
  // A backing, so the count reads over the map's own labels.
  count: {
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.base,
  },
}));

export function PlacesCarousel(props: PlacesCarouselProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<CarouselEntry>>(null);
  const gap = theme.space['10'];
  const cardWidth = width - theme.size.gutter - PEEK;
  const step = cardWidth + gap;
  const settled = useRef<string | null>(null);
  const first = props.entries[0]?.id ?? null;
  const position = Math.max(
    0,
    props.entries.findIndex((entry) => entry.id === props.focusedId),
  );

  // A new pick starts the row again at its own card.
  useEffect(() => {
    settled.current = first;
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [first]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / step);
    const entry = props.entries[Math.min(props.entries.length - 1, Math.max(0, index))];
    if (entry === undefined || settled.current === entry.id) return;
    settled.current = entry.id;
    props.onSettle(entry.id);
  };

  return (
    <View testID="places-carousel">
      <View style={styles.head}>
        <View style={styles.count}>
          <Text variant="eyebrow" numberOfLines={1} testID="places-carousel-count">
            {upper(carouselCount(position + 1, props.entries.length), i18n.locale)}
          </Text>
        </View>
      </View>
      <FlatList
        ref={list}
        horizontal
        data={props.entries}
        keyExtractor={(entry) => entry.id}
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: theme.size.gutter, gap }}
        onMomentumScrollEnd={settle}
        getItemLayout={(_, index) => ({ length: step, offset: step * index, index })}
        renderItem={({ item, index }) => (
          <View style={{ width: cardWidth }}>
            <PlaceCard
              title={upper(item.name, i18n.locale)}
              description={item.description}
              facts={item.facts}
              icon={categoryIcon(item.category)}
              {...props.photos?.get(item.id)?.tile}
              savers={item.savers}
              fit={item.fit}
              picked={item.id === props.focusedId}
              onPress={() => props.onOpen(item.id)}
              onAdd={
                props.onAdd === undefined || item.planned === true
                  ? undefined
                  : () => props.onAdd?.(item.id)
              }
              addLabel={addLabel(item.name)}
              badge={
                item.nextDoor ? (
                  <PlanningTag label={upper(nextDoorLabel(), i18n.locale)} />
                ) : undefined
              }
              testID={`places-card-${String(index)}`}
            />
          </View>
        )}
      />
      <View style={{ paddingHorizontal: theme.size.gutter, paddingTop: theme.space['6'] }}>
        <PhotoCredit
          plate
          credits={screenCredits(props.entries.map((entry) => props.photos?.get(entry.id)))}
        />
      </View>
    </View>
  );
}
