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

import type { StackMember } from '@/ui/people/AvatarStack';
import { PlaceCard, PlanningTag, type FitTone } from '@/ui/planning';
import { PressScale } from '@/ui/press/PressScale';
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
}

export interface PlacesCarouselProps {
  readonly entries: readonly CarouselEntry[];
  readonly focusedId: string | null;
  readonly onSettle: (id: string) => void;
  readonly onOpen: (id: string) => void;
  /** Absent while Add to plan is not on this phone. */
  readonly onAdd?: ((id: string) => void) | undefined;
  readonly onList: () => void;
}

const useStyles = makeStyles((t) => ({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.size.gutter,
    marginBottom: t.space['8'],
    gap: t.space['12'],
  },
  count: { flex: 1, minWidth: 0 },
  list: {
    flexShrink: 0,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['6'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.raised,
  },
  tag: { position: 'absolute', top: t.space['8'], end: t.space['8'] },
}));

export function PlacesCarousel(props: PlacesCarouselProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
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
        {/* The label gives way (it shortens with …) so the LIST pill stays whole on screen. */}
        <View style={styles.count}>
          <Text variant="eyebrow" numberOfLines={1} testID="places-carousel-count">
            {upper(carouselCount(position + 1, props.entries.length), i18n.locale)}
          </Text>
        </View>
        <PressScale
          style={styles.list}
          widthClass="narrow"
          accessibilityRole="button"
          accessibilityLabel={t({ id: 'places.showList', message: 'Show as a list' })}
          onPress={props.onList}
          testID="places-carousel-list"
        >
          <Text variant="label">
            {upper(t({ id: 'places.list', message: '≡ List' }), i18n.locale)}
          </Text>
        </PressScale>
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
              savers={item.savers}
              fit={item.fit}
              picked={item.id === props.focusedId}
              onPress={() => props.onOpen(item.id)}
              onAdd={props.onAdd === undefined ? undefined : () => props.onAdd?.(item.id)}
              addLabel={addLabel(item.name)}
              testID={`places-card-${String(index)}`}
            />
            {item.nextDoor ? (
              <View style={styles.tag} pointerEvents="none">
                <PlanningTag label={upper(nextDoorLabel(), i18n.locale)} />
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
