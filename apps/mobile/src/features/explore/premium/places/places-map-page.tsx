/**
 * A destination's places on the premium map (4.34, 4.35), for the places map's routes: in a trip,
 * outside one, or showing what a search found. The light or night map, every place as a dot (the
 * filter fades the rest to 20 %), the stay's flag, the glass back, the search pill with the guide
 * and the way to the list, the filter chips, and once a place is tapped its card with the others
 * nearest first. Drawn from the places map's own values (`PlacesMapViewProps`).
 */
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PremiumMapCanvas, StayFlag } from '@/features/plan';
import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  CritterSticker,
  EmptyState,
  GlassIconButton,
  GlassPill,
  GlassSurface,
  GuideNote,
  Icon,
  LoadingCritter,
  PressableScale,
  SearchField,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { BackEdge } from '@/ui/premium/shell/navigation/back-edge';

import { labelSubtitle } from '../../places/places-copy';
import type { PlacesMapViewProps } from '../../places/places-map-screen';
import { PlaceCards, nearestToPicked } from './place-cards';
import { PlaceDots } from './places-dots';
import { PlacesChips } from './places-chips';
import { placesWords } from './places-words';

/** The cards' height over the map's foot: the picked place eases to sit above them. */
const CARDS_PT = 196;
const PLACE_ZOOM = 15;

export function PremiumPlacesMapView(props: PlacesMapViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const reduced = usePremiumReducedMotion();
  const camera = useRef<CameraRef>(null);
  const { places, crew, onAsk } = props;
  const [anchor, setAnchor] = useState<string | null>(props.placeId ?? null);
  const [focused, setFocused] = useState<string | null>(props.placeId ?? null);
  const joinIndex = useMemo(
    () => new Map(crew.map((member) => [member.uid, member.joinIndex])),
    [crew],
  );
  const names = useMemo(() => new Map(crew.map((member) => [member.uid, member.name])), [crew]);
  const cards = useMemo(
    () => (anchor === null ? [] : nearestToPicked(places, anchor)),
    [places, anchor],
  );
  const asked = cards.flatMap((place) => (place.poiId === null ? [] : [place.poiId])).join(',');
  useEffect(() => {
    onAsk(asked === '' ? [] : asked.split(','));
  }, [asked, onAsk]);
  const focusedPlace = places.find((place) => place.id === focused) ?? null;
  useEffect(() => {
    if (focusedPlace === null) return;
    camera.current?.easeTo({
      center: [focusedPlace.lng, focusedPlace.lat],
      zoom: PLACE_ZOOM,
      padding: { top: insets.top + 110, bottom: CARDS_PT + 40, left: 0, right: 0 },
      duration: reduced ? 0 : 500,
    });
    // The place's id stands for its point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedPlace?.id, reduced]);

  const guide = guideSticker(props.guide.id);
  const centre = focusedPlace ?? props.centre ?? props.stay?.at ?? null;
  const pick = (id: string) => {
    setAnchor(id);
    setFocused(id);
  };
  const subtitle = (place: (typeof places)[number]) =>
    labelSubtitle(
      place,
      place.backerIds.map((uid) => names.get(uid) ?? '').filter((name) => name !== ''),
      props.guide.name,
    );
  const top = insets.top + 2;

  let body: ReactNode;
  if (props.failed === true) {
    body = (
      <EmptyState
        title={placesWords.failedTitle()}
        line={placesWords.failedLine()}
        critter={{ kind: props.guide.kind, name: props.guide.name }}
        {...(props.onRetry === undefined
          ? {}
          : {
              action: (
                <Button label={placesWords.retry()} variant="secondary" onPress={props.onRetry} />
              ),
            })}
        testID="places-map-failed"
      />
    );
  } else if (!props.canDraw) {
    body = (
      <EmptyState
        title={placesWords.offlineTitle()}
        line={placesWords.offlineLine(props.destinationName)}
        critter={{ kind: props.guide.kind, name: props.guide.name }}
        testID="places-map-offline"
      />
    );
  } else if (!props.loaded || centre === null) {
    body = <LoadingCritter label={placesWords.loading()} testID="places-map-loading" />;
  } else {
    body = (
      <PremiumMapCanvas
        cameraRef={camera}
        initialCenter={[centre.lng, centre.lat]}
        initialZoom={focusedPlace === null ? 12 : PLACE_ZOOM}
        destinationSlug={props.destinationSlug}
        localRegionUri={props.localRegionUri}
        ornamentBottom={anchor === null ? 12 : CARDS_PT + 12}
        onPressMap={() => {
          setAnchor(null);
          setFocused(null);
        }}
        testID="places-map"
      >
        <PlaceDots
          places={places}
          filter={props.filter}
          pickedId={focused}
          joinIndex={joinIndex}
          onPick={pick}
        />
        {props.stay === null ? null : (
          <StayFlag
            lngLat={[props.stay.at.lng, props.stay.at.lat]}
            label={placesWords.stay()}
            accessibilityLabel={props.stay.name}
          />
        )}
      </PremiumMapCanvas>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.color.ground }]} testID="places-map-page">
      {/* The map is its own chrome; the list it swaps with on the same route draws a bar. */}
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.fill}>{body}</View>
      <BackEdge />
      <View style={[styles.bar, { top, left: theme.space.gap16, right: theme.space.gap16 }]}>
        <GlassIconButton
          icon="back"
          label={placesWords.back()}
          onPress={props.onBack}
          testID="places-map-back"
        />
        {props.onQuery === undefined ? (
          <PressableScale
            onPress={props.onSearch}
            accessibilityRole="search"
            accessibilityLabel={placesWords.search(props.destinationName, props.guide.name)}
            testID="places-map-search"
            style={styles.fill}
          >
            <GlassSurface kind="nav" interactive style={[styles.pill, { gap: theme.space.gap8 }]}>
              <Icon name="search" size={17} color={theme.color.muted} />
              <Text variant="body" tone="inkSecondary" numberOfLines={1} style={styles.fill}>
                {placesWords.search(props.destinationName, props.guide.name)}
              </Text>
              <View style={[styles.guide, { backgroundColor: theme.color.status.maybe.bg }]}>
                <CritterSticker kind={guide.kind} name={guide.name} size={34} pose="point" />
              </View>
            </GlassSurface>
          </PressableScale>
        ) : (
          <View style={styles.fill}>
            <SearchField
              value={props.query ?? ''}
              onChangeText={props.onQuery}
              placeholder={placesWords.findHere(props.destinationName)}
              accessibilityLabel={placesWords.findHere(props.destinationName)}
              returnKeyType="search"
              testID="places-map-field"
            />
          </View>
        )}
        <GlassPill label={placesWords.list()} onPress={props.onList} testID="places-map-list" />
      </View>
      <View style={[styles.under, { top: top + 58, gap: theme.space.gap8 }]}>
        {props.resultChips === undefined ? (
          <PlacesChips places={places} filter={props.filter} onFilter={props.onFilter} over="map" />
        ) : (
          <View style={{ paddingHorizontal: theme.space.gap16 }}>
            <GuideNote
              name={props.guide.name}
              text={placesWords.results(props.resultChips)}
              showName={false}
              action={{ label: placesWords.showAll(), onPress: props.onLeaveResults }}
              testID="places-map-results"
            />
          </View>
        )}
      </View>
      {anchor === null ? null : (
        <PlaceCards
          key={anchor}
          places={cards}
          subtitle={subtitle}
          fitLines={props.fitLines}
          bottom={insets.bottom + theme.space.gap16}
          onFocus={setFocused}
          onOpen={props.onOpen}
          onAdd={props.onAdd}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  bar: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: {
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingStart: 16,
    paddingEnd: 6,
  },
  guide: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  under: { position: 'absolute', left: 0, right: 0 },
});
