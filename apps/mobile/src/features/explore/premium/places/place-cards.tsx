/**
 * The cards under a picked place on the premium places map (4.35): the picked place first, then
 * the rest nearest first, one card in view at a time. Each card: the place's doodle on ground, its
 * name, who saved it or which day it is on, the fit line in its tone, and the `+` that adds it.
 * Swiping the cards focuses the card in view, so the map's highlight follows; the order stays.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import {
  ScrollView,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { FitLine } from '@/data/fit/fit-line';
import { IconButton, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import { carouselCount } from '../../places/places-copy';
import type { HubPlace } from '../../places/places-model';
import { placeIcon } from '../../search/place-icons';
import { Doodle } from '../components/doodle';
import { fitColour } from '../components/place-result-row';

const CARD_W = 300;

/** The picked place first, then the others by how far they are from it. */
export function nearestToPicked(places: readonly HubPlace[], pickedId: string): HubPlace[] {
  const picked = places.find((place) => place.id === pickedId);
  if (picked === undefined) return [];
  const away = (place: HubPlace) =>
    (place.lat - picked.lat) ** 2 +
    ((place.lng - picked.lng) * Math.cos((picked.lat * Math.PI) / 180)) ** 2;
  return [
    picked,
    ...places.filter((place) => place.id !== pickedId).sort((a, b) => away(a) - away(b)),
  ];
}

export interface PlaceCardsProps {
  readonly places: readonly HubPlace[];
  readonly subtitle: (place: HubPlace) => string;
  readonly fitLines: ReadonlyMap<string, FitLine>;
  readonly bottom: number;
  /** The card in view changed (the map highlights it). */
  readonly onFocus: (placeId: string) => void;
  readonly onOpen: (placeId: string) => void;
  readonly onAdd: ((placeId: string) => void) | undefined;
}

export function PlaceCards(props: PlaceCardsProps) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const step = CARD_W + theme.space.gap10;
  const count = props.places.length;
  if (count === 0) return null;
  const onSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / step);
    const place = props.places[next];
    if (place === undefined) return;
    setIndex(next);
    props.onFocus(place.id);
  };
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: props.bottom,
        gap: theme.space.gap8,
      }}
      testID="places-map-cards"
    >
      <View
        style={{
          alignSelf: 'flex-start',
          marginLeft: theme.space.titleGutter,
          paddingVertical: 5,
          paddingHorizontal: theme.space.gap10,
          borderRadius: theme.radius.tag,
          backgroundColor: theme.color.card,
        }}
      >
        <Text variant="badge" tone="inkSecondary">
          {carouselCount(Math.min(index, count - 1) + 1, count).toLocaleUpperCase()}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        onMomentumScrollEnd={onSettle}
        contentContainerStyle={{
          gap: theme.space.gap10,
          paddingHorizontal: theme.space.gap16,
          paddingRight: Math.max(theme.space.gap16, width - CARD_W - theme.space.gap16),
        }}
      >
        {props.places.map((place) => {
          const fit = place.poiId === null ? undefined : props.fitLines.get(place.poiId);
          return (
            <PressableScale
              key={place.id}
              onPress={() => props.onOpen(place.id)}
              accessibilityRole="button"
              accessibilityLabel={place.name}
              testID={`places-map-card-${place.id}`}
              style={{
                width: CARD_W,
                borderRadius: theme.radius.cardRow,
                backgroundColor: theme.color.card,
                boxShadow: theme.shadow.card,
                padding: theme.space.gap10,
                flexDirection: 'row',
                gap: theme.space.gap12,
              }}
            >
              <View
                style={{
                  width: 96,
                  height: 112,
                  borderRadius: 16,
                  backgroundColor: theme.color.ground,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Doodle name={placeIcon(place.category)} size={64} />
              </View>
              <View style={{ flex: 1, justifyContent: 'space-between' }}>
                <View style={{ gap: 2 }}>
                  <Text variant="headline" numberOfLines={2}>
                    {place.name}
                  </Text>
                  <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                    {props.subtitle(place)}
                  </Text>
                  {fit === undefined || fit.tone === 'none' ? null : (
                    <Text variant="helper" color={fitColour(theme, fit.tone)} numberOfLines={2}>
                      {fit.text}
                    </Text>
                  )}
                </View>
                {props.onAdd === undefined || place.standing === 'plan' ? null : (
                  <View style={{ alignItems: 'flex-end' }}>
                    <IconButton
                      icon="plus"
                      size={34}
                      tone="control"
                      label={t({ id: 'search.premium.row.add', message: `Add ${place.name}` })}
                      onPress={() => props.onAdd?.(place.id)}
                      testID={`places-map-card-add-${place.id}`}
                    />
                  </View>
                )}
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}
