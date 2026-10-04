/**
 * The places map (7c-1) and a picked place (7c-2), drawn from plain values: every place on the map
 * with no label until a tap, one filter at a time fading the rest, the plan's days as routes with
 * edge chips for stops off screen, the picked place's label and the cards under it moving
 * together, and the region pack card while the region isn't on the phone.
 */
import { resolveMemberStyle } from '@cp/design-tokens';
import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import type { FitLine } from '@/data/fit/fit-line';
import { EdgeIndicator, PlanningMapCanvas, usePlanningCamera } from '@/ui/map/planning';
import type { StackMember } from '@/ui/people/AvatarStack';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles, useTheme } from '@/ui/theme';

import type { GuideFacts } from '../format';
import { centreOf, type Point } from '../map-model';
import { useLabelSync } from './label-sync';
import { gatherDots } from './place-clusters';
import { leadDay, openingFrame, type PlanRouteDay } from './plan-routes';
import { PlacesCarousel } from './places-carousel';
import { labelSubtitle } from './places-copy';
import { PlacesHeader } from './places-header';
import { PlacesMapLayers } from './places-map-layers';
import { placeCounts, type HubPlace, type PlacesFilter } from './places-model';
import { PlacesPeek } from './places-peek';
import { useCarouselEntries } from './use-carousel-entries';
import type { CrewMember } from './use-places-data';
import { placeDots, usePlacesInView } from './use-places-in-view';

/** The cards' height over the map's foot: the picked place eases to sit above them. */
const CARDS_PT = 196;
const PEEK_PT = 96;
const HEADER_PT = 124;

export interface PlacesMapViewProps {
  readonly inTrip: boolean;
  readonly loaded: boolean;
  readonly places: readonly HubPlace[];
  readonly crew: readonly CrewMember[];
  readonly routes: readonly PlanRouteDay[];
  /** Today's local date in the trip's zone: the map leads with today's route. */
  readonly today: string;
  readonly destinationName: string;
  readonly destinationSlug: string | null;
  readonly guide: GuideFacts;
  readonly stay: { readonly name: string; readonly at: Point } | null;
  readonly tz: string | null;
  /** Whether the map can draw (online, or the region is on this phone). */
  readonly canDraw: boolean;
  readonly localRegionUri: string | null;
  /** The region pack card while the region isn't on this phone; null once it is. */
  readonly pack: ReactNode | null;
  readonly placeId?: string | null | undefined;
  readonly filter: PlacesFilter;
  readonly onFilter: (filter: PlacesFilter) => void;
  readonly resultChips?: readonly string[] | undefined;
  readonly onLeaveResults: () => void;
  readonly query?: string | undefined;
  readonly onQuery?: ((text: string) => void) | undefined;
  readonly fitLines: ReadonlyMap<string, FitLine>;
  readonly photos?: PlaceTilePhotos | undefined;
  /** The places on the cards, for the screen to ask their fits. */
  readonly onAsk: (poiIds: readonly string[]) => void;
  readonly onOpen: (id: string) => void;
  readonly onAdd?: ((id: string) => void) | undefined;
  readonly onSearch: () => void;
  readonly onList: () => void;
  readonly onBack: () => void;
}

const useStyles = makeStyles((t) => ({
  top: { position: 'absolute', top: 0, start: 0, end: 0 },
  bottom: { position: 'absolute', bottom: 0, start: 0, end: 0, gap: t.space['8'] },
  pack: { marginHorizontal: t.size.gutter },
  unavailable: { justifyContent: 'center', paddingHorizontal: t.size.gutter },
}));

export function PlacesMapView(props: PlacesMapViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { filter, places, crew, onAsk } = props;
  const camera = usePlanningCamera();
  const label = useLabelSync(props.placeId ?? null);
  const [initialZoom] = useState(props.placeId === undefined || props.placeId === null ? 12 : 15);
  const [region, setRegion] = useState<{ bounds: LngLatBounds | null; zoom: number }>({
    bounds: null,
    zoom: initialZoom,
  });
  const [size, setSize] = useState({ width: 0, height: 0 });

  const byUid = useMemo(() => new Map(crew.map((member) => [member.uid, member])), [crew]);
  const saversOf = useCallback(
    (place: HubPlace): StackMember[] =>
      place.backerIds.map((uid) => ({
        key: uid,
        name: byUid.get(uid)?.name ?? '',
        joinIndex: byUid.get(uid)?.joinIndex ?? 0,
      })),
    [byUid],
  );
  // The plan's places are drawn as their days' routes, not as dots.
  const gathered = useMemo(() => {
    const dots = placeDots(
      places.filter((place) => place.standing !== 'plan'),
      filter,
      (uid) => {
        const member = byUid.get(uid);
        return member === undefined ? undefined : resolveMemberStyle(member.joinIndex).color;
      },
    );
    return gatherDots(dots, Math.floor(region.zoom));
  }, [places, filter, byUid, region.zoom]);
  const counts = useMemo(() => placeCounts(places), [places]);
  const view = usePlacesInView({ places, filter, bounds: region.bounds, anchorId: null });
  // The cards are the places in view when the dot was tapped: the camera easing to each card
  // afterwards never changes the set or its order under a finger.
  const [frozen, setFrozen] = useState<{
    anchorId: string | null;
    bounds: LngLatBounds | null;
  }>({ anchorId: null, bounds: null });
  // Opened on a place, the first settled camera (already on it) sets the set.
  if (frozen.anchorId !== label.anchorId || (frozen.bounds === null && region.bounds !== null)) {
    setFrozen({ anchorId: label.anchorId, bounds: region.bounds });
  }
  const picked = usePlacesInView({
    places,
    filter,
    bounds: frozen.bounds,
    anchorId: frozen.anchorId,
  });
  useEffect(() => {
    onAsk(picked.carousel.flatMap((place) => (place.poiId === null ? [] : [place.poiId])));
  }, [onAsk, picked.carousel]);
  const entries = useCarouselEntries({
    carousel: picked.carousel,
    stay: props.stay,
    tz: props.tz,
    fits: props.fitLines,
    saversOf,
  });

  const focused = places.find((place) => place.id === label.focusedId) ?? null;
  const { flyToPlace, fitPoints } = camera;
  // Opened without a place, the map frames where the crew's places mostly are, once they are
  // here; the far ones are reached by the edge chips.
  const framed = useRef(props.placeId !== undefined && props.placeId !== null);
  const stay = props.stay;
  useEffect(() => {
    if (framed.current || places.length === 0 || region.bounds === null) return;
    const core = [
      ...(stay === null ? [] : [stay.at]),
      ...places.filter((place) => place.standing !== 'suggested'),
    ];
    const frame = openingFrame(core, places);
    if (frame.length === 0) return;
    framed.current = true;
    fitPoints(frame, { top: insets.top + HEADER_PT, bottom: insets.bottom + PEEK_PT });
  }, [places, stay, region.bounds, fitPoints, insets.top, insets.bottom]);

  useEffect(() => {
    if (focused === null) return;
    flyToPlace([focused.lng, focused.lat], {
      covered: { top: insets.top + HEADER_PT, bottom: insets.bottom + CARDS_PT },
    });
  }, [flyToPlace, focused, insets.top, insets.bottom]);

  const lead = leadDay(props.routes, label.focusedId, props.today);
  const leadDayNo = filter === 'all' || filter === 'plan' ? lead : -1;
  const leadRoute = props.routes.find((day) => day.dayNo === lead);
  const centre = focused ?? centreOf(places);
  const carousel = focused !== null && entries.length > 0;
  const coveredBottom = insets.bottom + (carousel ? CARDS_PT : PEEK_PT);
  const saverNames =
    focused === null ? [] : focused.backerIds.map((uid) => byUid.get(uid)?.name ?? '');

  return (
    <Scaffold variant="map" edges={[]} testID="places-map">
      <View style={StyleSheet.absoluteFill} onLayout={(event) => setSize(event.nativeEvent.layout)}>
        {props.canDraw && centre !== null ? (
          <PlanningMapCanvas
            initialCenter={[centre.lng, centre.lat]}
            initialZoom={initialZoom}
            destinationSlug={props.destinationSlug}
            localRegionUri={props.localRegionUri}
            stay={props.stay === null ? null : [props.stay.at.lng, props.stay.at.lat]}
            cameraRef={camera.cameraRef}
            ornamentBottom={coveredBottom}
            logo={false}
            onRegionChange={(next) => setRegion({ bounds: next.bounds, zoom: next.zoom })}
            onPressMap={label.clear}
            testID="places-map-canvas"
          >
            <PlacesMapLayers
              dots={gathered.dots}
              clusters={gathered.clusters}
              routes={props.routes}
              leadDayNo={leadDayNo}
              stay={props.stay === null ? null : [props.stay.at.lng, props.stay.at.lat]}
              focused={focused}
              labelSubtitle={
                focused === null ? '' : labelSubtitle(focused, saverNames, props.guide.name)
              }
              onPick={(id) => {
                if (places.some((place) => place.id === id)) label.pick(id);
              }}
              onCluster={(cluster) =>
                camera.fitPoints(
                  [
                    [cluster.bounds[0], cluster.bounds[1]],
                    [cluster.bounds[2], cluster.bounds[3]],
                  ],
                  { top: insets.top + HEADER_PT, bottom: coveredBottom },
                )
              }
            />
          </PlanningMapCanvas>
        ) : props.loaded ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.unavailable,
              { backgroundColor: theme.color.map.base },
            ]}
            testID="places-map-unavailable"
          >
            {props.pack}
          </View>
        ) : null}
      </View>
      {/* The cards cover the map's foot: edge chips show only over the peek. */}
      {props.canDraw && leadRoute !== undefined && !carousel ? (
        <EdgeIndicator
          stops={leadRoute.stops.map((stop) => ({ ...stop, color: leadRoute.color }))}
          bounds={region.bounds}
          size={size}
          coveredTop={insets.top + HEADER_PT}
          coveredBottom={coveredBottom}
          onPress={(id) => {
            const stop = leadRoute.stops.find((entry) => entry.id === id);
            if (stop !== undefined) camera.flyToPlace([stop.lng, stop.lat], { zoom: 13 });
          }}
        />
      ) : null}
      <View
        style={[styles.top, { paddingTop: insets.top + theme.space['8'] }]}
        pointerEvents="box-none"
      >
        <PlacesHeader
          destinationName={props.destinationName}
          guide={props.guide}
          mode="map"
          onBack={props.onBack}
          onSearch={props.onSearch}
          onToggleMode={props.onList}
          counts={counts}
          filter={filter}
          onFilter={props.onFilter}
          inTrip={props.inTrip}
          resultChips={props.resultChips}
          onLeaveResults={props.onLeaveResults}
          query={props.query}
          onQuery={props.onQuery}
        />
      </View>
      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + theme.space['12'] }]}
        pointerEvents="box-none"
      >
        {props.canDraw && props.pack !== null && focused === null ? (
          <View style={styles.pack}>{props.pack}</View>
        ) : null}
        {carousel ? (
          <PlacesCarousel
            entries={entries}
            photos={props.photos}
            focusedId={label.focusedId}
            onSettle={label.settle}
            onOpen={props.onOpen}
            onAdd={props.onAdd}
            onList={props.onList}
          />
        ) : (
          <PlacesPeek
            count={view.inView.length}
            loading={!props.loaded}
            inTrip={props.inTrip}
            onList={props.onList}
          />
        )}
      </View>
    </Scaffold>
  );
}
