/**
 * The places map (7c-1) and a picked place (7c-2), inside a trip or, without one, for a
 * destination: every place as a map layer with no label until a tap, one filter at a time fading
 * the rest, the picked place's label and the cards under it moving together, and the region's
 * offline pack offered while it isn't on the phone.
 */
import { resolveMemberStyle } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSyncStatus } from '@/data/status/use-sync-status';
import { MapLabel, PlaceDotsLayer, PlanningMapCanvas, usePlanningCamera } from '@/ui/map/planning';
import type { StackMember } from '@/ui/people/AvatarStack';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles, useTheme } from '@/ui/theme';

import { RegionPackCardView } from '../components/region-pack-card';
import { useOfflinePack } from '../data/use-offline-pack';
import { guideFor } from '../format';
import { centreOf } from '../map-model';
import { useLabelSync } from './label-sync';
import { PlacesCarousel } from './places-carousel';
import { labelSubtitle } from './places-copy';
import { PlacesHeader } from './places-header';
import { placeCounts, type HubPlace, type PlacesFilter } from './places-model';
import { addToPlanHref, placeHref, searchHref, useCanAddToPlan } from './places-nav';
import { PlacesPeek } from './places-peek';
import type { ResultsMode } from './routes';
import { useCarouselEntries } from './use-carousel-entries';
import { usePlaceFits } from './use-place-fits';
import { usePlacesData } from './use-places-data';
import { placeDots, usePlacesInView } from './use-places-in-view';

/** The cards' height over the map's foot: the picked place eases to sit above them. */
const CARDS_PT = 196;
const HEADER_PT = 124;

export interface PlacesMapScreenProps {
  /** Outside a trip: the map's own field over the places on this phone. */
  readonly query?: string | undefined;
  readonly onQuery?: ((text: string) => void) | undefined;
  readonly tripId: string | null;
  /** Outside a trip: the destination's id or slug. */
  readonly destination?: string | null | undefined;
  readonly placeId?: string | null | undefined;
  readonly filter: PlacesFilter;
  readonly onFilter: (filter: PlacesFilter) => void;
  readonly results: ResultsMode | null;
  readonly onLeaveResults: () => void;
  readonly onList: () => void;
  readonly onBack: () => void;
}

const useStyles = makeStyles((t) => ({
  top: { position: 'absolute', top: 0, start: 0, end: 0 },
  bottom: { position: 'absolute', bottom: 0, start: 0, end: 0, gap: t.space['8'] },
  pack: { marginHorizontal: t.size.gutter },
  unavailable: { justifyContent: 'center', paddingHorizontal: t.size.gutter },
}));

export function PlacesMapScreen(props: PlacesMapScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { tripId, filter } = props;
  const data = usePlacesData({
    tripId,
    destination: props.destination,
    results: props.results?.ids ?? null,
    query: props.query,
  });
  const guide = guideFor(data.guideSlug);
  const sync = useSyncStatus();
  const pack = useOfflinePack(data.destinationId ?? '', data.destinationSlug ?? '');
  const camera = usePlanningCamera();
  const label = useLabelSync(props.placeId ?? null);
  const { i18n } = useLingui();
  // Add to plan shows its + only once its screen is on this phone.
  const canAdd = useCanAddToPlan(tripId);
  const [bounds, setBounds] = useState<LngLatBounds | null>(null);

  const crew = data.plan.crew;
  const joinIndex = useMemo(
    () => new Map(crew.map((member, index) => [member.user_id, index])),
    [crew],
  );
  const nameOf = useCallback(
    (uid: string) => crew.find((member) => member.user_id === uid)?.display_name ?? '',
    [crew],
  );
  const saversOf = useCallback(
    (place: HubPlace): StackMember[] =>
      place.backerIds.map((uid) => ({
        key: uid,
        name: nameOf(uid),
        joinIndex: joinIndex.get(uid) ?? 0,
      })),
    [joinIndex, nameOf],
  );
  const dots = useMemo(
    () =>
      placeDots(data.places, filter, (uid) => {
        const index = joinIndex.get(uid);
        return index === undefined ? undefined : resolveMemberStyle(index).color;
      }),
    [data.places, filter, joinIndex],
  );
  const counts = useMemo(() => placeCounts(data.places), [data.places]);
  const view = usePlacesInView({ places: data.places, filter, bounds, anchorId: label.anchorId });
  const askIds = useMemo(
    () => view.carousel.flatMap((place) => (place.poiId === null ? [] : [place.poiId])),
    [view.carousel],
  );
  const fits = usePlaceFits({
    tripId,
    plan: data.plan,
    tz: data.tz,
    ask: askIds,
    ideas: data.ideas,
  });
  const entries = useCarouselEntries({
    carousel: view.carousel,
    stay: data.stay,
    tz: data.tz,
    fits,
    saversOf,
  });

  const focused = data.places.find((place) => place.id === label.focusedId) ?? null;
  const { flyToPlace } = camera;
  useEffect(() => {
    if (focused === null) return;
    flyToPlace([focused.lng, focused.lat], {
      covered: { top: insets.top + HEADER_PT, bottom: insets.bottom + CARDS_PT },
    });
  }, [flyToPlace, focused, insets.top, insets.bottom]);

  const open = (id: string) => {
    const poiId = data.places.find((entry) => entry.id === id)?.poiId ?? id;
    router.push(placeHref(poiId, tripId, data.destinationId));
  };
  const add =
    tripId === null || !canAdd
      ? undefined
      : (id: string) => {
          const poiId = data.places.find((entry) => entry.id === id)?.poiId ?? id;
          const href = addToPlanHref(tripId, poiId);
          if (href !== undefined) router.push(href);
        };
  const search = () => {
    const href = searchHref(tripId, tripId === null ? 'explore' : 'map');
    if (href !== undefined) router.push(href);
  };

  const centre = focused ?? centreOf(data.places);
  const offline = sync.phase === 'offline';
  const canDraw = (!offline || pack.uri !== null) && centre !== null;
  const packDownloaded = pack.status === 'downloaded' || pack.status === 'checking';
  const packCard = (
    <RegionPackCardView
      destinationName={data.destinationName}
      status={pack.status === 'checking' ? 'none' : pack.status}
      progress={pack.progress}
      bytes={pack.bytes}
      onDownload={pack.download}
      onRemove={pack.remove}
    />
  );
  const saverNames = focused === null ? [] : focused.backerIds.map(nameOf);

  return (
    <Scaffold variant="map" edges={[]} testID="places-map">
      {canDraw ? (
        <View style={StyleSheet.absoluteFill}>
          <PlanningMapCanvas
            initialCenter={[centre.lng, centre.lat]}
            initialZoom={focused === null ? 12 : 15}
            destinationSlug={data.destinationSlug}
            localRegionUri={pack.uri}
            stay={data.stay === null ? null : [data.stay.at.lng, data.stay.at.lat]}
            cameraRef={camera.cameraRef}
            ornamentBottom={insets.bottom + (focused === null ? 96 : CARDS_PT)}
            onRegionChange={(region) => setBounds(region.bounds)}
            onPressMap={label.clear}
            testID="places-map-canvas"
          >
            <PlaceDotsLayer
              id="cp-places"
              places={dots}
              onSelectPlace={label.pick}
              onPressCluster={(cluster) =>
                camera.openCluster(cluster.center, cluster.expansionZoom)
              }
            />
            {focused === null ? null : (
              <MapLabel
                lngLat={[focused.lng, focused.lat]}
                title={upper(focused.name, i18n.locale)}
                subtitle={upper(labelSubtitle(focused, saverNames, guide.name), i18n.locale)}
                lift={18}
                testID="places-map-label"
              />
            )}
          </PlanningMapCanvas>
        </View>
      ) : data.loaded ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.unavailable,
            { backgroundColor: theme.color.map.base },
          ]}
          testID="places-map-unavailable"
        >
          {packCard}
        </View>
      ) : null}
      <View
        style={[styles.top, { paddingTop: insets.top + theme.space['8'] }]}
        pointerEvents="box-none"
      >
        <PlacesHeader
          destinationName={data.destinationName}
          guide={guide}
          mode="map"
          onBack={props.onBack}
          onSearch={search}
          onToggleMode={props.onList}
          counts={counts}
          filter={filter}
          onFilter={props.onFilter}
          inTrip={tripId !== null}
          resultChips={props.results?.chips}
          onLeaveResults={props.onLeaveResults}
          query={props.query}
          onQuery={props.onQuery}
        />
      </View>
      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + theme.space['12'] }]}
        pointerEvents="box-none"
      >
        {canDraw && !packDownloaded && focused === null ? (
          <View style={styles.pack}>{packCard}</View>
        ) : null}
        {focused !== null && entries.length > 0 ? (
          <PlacesCarousel
            entries={entries}
            focusedId={label.focusedId}
            onSettle={label.settle}
            onOpen={open}
            onAdd={add}
            onList={props.onList}
          />
        ) : (
          <PlacesPeek
            count={view.inView.length}
            loading={!data.loaded}
            inTrip={tripId !== null}
            onList={props.onList}
          />
        )}
      </View>
    </Scaffold>
  );
}
