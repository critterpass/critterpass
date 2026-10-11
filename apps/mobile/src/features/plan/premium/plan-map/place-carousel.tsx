/**
 * A place picked on the plan map (4.35): "1 of 6 in view · nearest first" over a paging row of
 * cards, the picked place first and the nearest after it, each with its kind doodle, its name, who
 * saved it, and `+` (Add to plan on the day it fits). A card opens the place page; tapping the map
 * closes the cards.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View, useWindowDimensions } from 'react-native';

import { Doodle, placeIcon } from '@/features/explore';
import { IconButton, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import type { MapPlace } from '../../trip-map/map-places';

const CARD_W = 300;
const SHOWN = 6;

/** The picked place, then the nearest others (flat-earth distance is plenty at city scale). */
export function nearestFirst(places: readonly MapPlace[], pickedId: string): MapPlace[] {
  const picked = places.find((place) => place.id === pickedId);
  if (picked === undefined) return [];
  const away = (place: MapPlace) =>
    (place.lat - picked.lat) ** 2 +
    ((place.lng - picked.lng) * Math.cos((picked.lat * Math.PI) / 180)) ** 2;
  return [
    picked,
    ...places
      .filter((place) => place.id !== pickedId)
      .sort((a, b) => away(a) - away(b))
      .slice(0, SHOWN - 1),
  ];
}

export function PlaceCarousel(props: {
  readonly places: readonly MapPlace[];
  readonly bottom: number;
  readonly onOpen: (placeId: string) => void;
  readonly onAdd: ((placeId: string) => void) | null;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const { width } = useWindowDimensions();
  const count = props.places.length;
  if (count === 0) return null;
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: props.bottom,
        gap: theme.space.gap8,
      }}
      testID="plan-map-carousel"
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
          {t({
            id: 'plan.premium.carousel.count',
            message: `1 of ${count} in view · nearest first`,
          }).toLocaleUpperCase()}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_W + theme.space.gap10}
        decelerationRate="fast"
        contentContainerStyle={{
          gap: theme.space.gap10,
          paddingHorizontal: theme.space.gap16,
          paddingRight: width - CARD_W - theme.space.gap16,
        }}
      >
        {props.places.map((place) => (
          <PressableScale
            key={place.id}
            onPress={() => props.onOpen(place.id)}
            accessibilityRole="button"
            accessibilityLabel={place.name}
            testID={`plan-map-card-${place.id}`}
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
                {place.tier === 'saved' ? (
                  <Text variant="captionMuted" tone="muted">
                    {t({
                      id: 'plan.premium.carousel.saved',
                      message: plural(place.backers, {
                        one: 'Saved by one of the crew',
                        other: 'Saved by # of the crew',
                      }),
                    })}
                  </Text>
                ) : null}
              </View>
              {props.onAdd === null ? null : (
                <View style={{ alignItems: 'flex-end' }}>
                  <IconButton
                    icon="plus"
                    size={34}
                    tone="control"
                    label={t({ id: 'search.row.add', message: `Add ${place.name}` })}
                    onPress={() => props.onAdd?.(place.id)}
                    testID={`plan-map-card-add-${place.id}`}
                  />
                </View>
              )}
            </View>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}
