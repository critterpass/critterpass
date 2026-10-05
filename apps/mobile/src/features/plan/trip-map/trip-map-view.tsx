/**
 * The trip map (7a-1 peek, 7a-2 half, 7a-3 full; 7i-1 when nothing is saved): the map with the
 * chosen day traced from the stay, the search pill and LIST, the filter chips, edge pills for the
 * day's stops off screen, and the sheet whose content follows its snap. The map opens on the
 * chosen day's stops and the camera fits them above the sheet as it settles, and again when the
 * day's stops change; at half the guide's dots step aside. Pulled up from half, the sheet keeps the
 * day (now scrolling) and ALL DAYS turns it into the whole trip. A tap on a pin leads somewhere:
 * its label and the card at the head of the peek sheet open the stop or the place. A route a sheet
 * over the map asks for (`usePlanningMapPreview`) draws too.
 */
import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import { useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlanningMapPreview } from '@/data/plan/map-preview';
import { useLocale } from '@/lib/i18n/use-locale';
import { EdgeIndicator, usePlanningCamera } from '@/ui/map/planning';
import { useRegionTiles } from '@/ui/map/region-pack';
import { NOTICE_ROOM } from '@/ui/map/RegionPackNotice';
import { MapSheet, MapSheetScrollView, type MapSheetSnap } from '@/ui/sheet/map-sheet';
import { mapSheetHeights } from '@/ui/sheet/map-sheet-snap';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

import type { DayRoute } from './day-route';
import { routeDays } from './day-route';
import { DaySheet } from './day-sheet';
import { EmptyTripSheet, FloatingGuide } from './empty-trip-sheet';
import {
  categoryChips,
  CREW_PICK_BACKERS,
  mapPlaces,
  NO_FILTER,
  type MapFilter,
} from './map-places';
import { PeekSheet } from './peek-sheet';
import { PickedHead } from './picked-card';
import type { TripMapModel } from './sheet-props';
import {
  edgeStops,
  fitSignature,
  openingCamera,
  pickedStopOf,
  viewPoints,
} from './trip-map-camera';
import { PreviewRoute, TripMapLayers, type Picked } from './trip-map-layers';
import { TripMapTop } from './trip-map-top';
import { TripSheet } from './trip-sheet';
import { useFitCamera } from './use-fit-camera';

const useStyles = makeStyles((t) => ({
  sheetBody: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['24'] },
  guide: { position: 'absolute', start: 0, end: 0, alignItems: 'center' },
}));

/** The map strip the full sheet leaves under the status bar. */
const FULL_STRIP = 64;
/** Room the search pill and chips take at the top. */
const TOP_BAR = 120;
/** Kept clear around the fitted stops, so none sits half under the chips or the sheet. */
const PIN_ROOM = 28;

export interface TripMapViewProps {
  readonly model: TripMapModel;
  readonly dayNo: number | null;
  readonly onDayNo: (dayNo: number) => void;
  readonly route: DayRoute;
  readonly initialSnap?: MapSheetSnap | undefined;
  readonly onShare: () => void;
  readonly onOpenDay: (dayNo: number) => void;
  readonly onBack: () => void;
  /** Opens a stop's sheet over the map. */
  readonly onOpenStop: (stableId: string) => void;
  /** Opens a place's page; absent while that screen is not there. */
  readonly onOpenPlace?: ((placeId: string) => void) | undefined;
  /** Opens all days as a grid, where stops move between days. */
  readonly onMoveStops?: (() => void) | undefined;
}

export function TripMapView(props: TripMapViewProps) {
  const styles = useStyles();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const camera = usePlanningCamera();
  const preview = usePlanningMapPreview();
  const { model, route } = props;
  const [snap, setSnapState] = useState<MapSheetSnap>(
    model.empty ? 'half' : (props.initialSnap ?? 'peek'),
  );
  // What the sheet shows at full: the whole trip (ALL DAYS, a link), or the day she was reading
  // at half and pulled up to read to its end.
  const [fullShows, setFullShows] = useState<'trip' | 'day'>('trip');
  const [filter, setFilter] = useState<MapFilter>(NO_FILTER);
  const [traced, setTraced] = useState(true);
  const [picked, setPicked] = useState<Picked>(null);
  const [bounds, setBounds] = useState<LngLatBounds | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const day = model.days.find((entry) => entry.dayNo === props.dayNo) ?? model.days[0] ?? null;
  const wholeTrip = snap === 'full' && fullShows === 'trip';
  const setSnap = (next: MapSheetSnap, shows?: 'trip' | 'day') => {
    if (next === 'full') {
      // Pulled up from half, the sheet keeps the day; the picked stop's label would float over
      // the status bar, so it is let go.
      setFullShows(shows ?? (snap === 'half' ? 'day' : snap === 'full' ? fullShows : 'trip'));
      setPicked(null);
    }
    setSnapState(next);
  };
  const heights = mapSheetHeights(size.height, insets.top + FULL_STRIP);
  const sheetHeight = snap === 'peek' ? heights[0] : snap === 'half' ? heights[1] : heights[2];
  const covered = { top: insets.top + TOP_BAR, bottom: sheetHeight };
  // A destination without a region pack says so in a line above the sheet: the camera keeps the
  // stay and the fitted stops clear of it for as long as it shows.
  const tiles = useRegionTiles(model.destinationSlug, model.regionUri);
  const noted = tiles.awaited && model.destination !== null && snap !== 'full';
  const clear = noted ? { ...covered, bottom: covered.bottom + NOTICE_ROOM } : covered;

  const allPlaces = useMemo(
    () =>
      mapPlaces({
        ideas: model.ideas,
        curated: model.curated,
        planned: model.planned,
        joinIndex: new Map(model.members.map((member) => [member.uid, member.joinIndex])),
        filter,
        showSuggested: snap === 'peek',
      }),
    [model.ideas, model.curated, model.planned, model.members, filter, snap],
  );
  const places = snap === 'full' ? [] : allPlaces;
  const days = useMemo(() => routeDays(model.days, model.legPaths), [model.days, model.legPaths]);
  const chosenDayNo = wholeTrip || !traced ? null : (day?.dayNo ?? null);
  const stay = day?.stay ?? null;
  const crewPicks = allPlaces.filter(
    (place) => place.tier === 'saved' && place.backers >= CREW_PICK_BACKERS,
  ).length;

  // The camera follows the sheet and the chosen day once the screen has a size, and fits again
  // when the day's stops change (an edit); a re-read of the same plan does not move it. At full
  // the map is a strip under the status bar and the camera stays where it was.
  const points = useMemo(() => viewPoints(model, day), [model, day]);
  useFitCamera(camera, {
    fitKey: `${snap === 'full' ? 'half' : snap}|${fitSignature(day)}|${String(size.height)}|${String(noted)}`,
    ready: size.height > 0 && bounds !== null && snap !== 'full',
    points,
    // Room for a pin and its number inside the part of the map that shows.
    covered: { top: clear.top + PIN_ROOM, bottom: clear.bottom + PIN_ROOM },
    bounds,
  });
  // The map opens already on the day's stops: the first fit can be lost while the style loads.
  const [opening] = useState(() => {
    const window = Dimensions.get('window');
    return openingCamera(points, window, {
      top: insets.top + TOP_BAR + PIN_ROOM,
      bottom:
        mapSheetHeights(window.height, insets.top + FULL_STRIP)[snap === 'peek' ? 0 : 1] + PIN_ROOM,
    });
  });

  const pickedStop = pickedStopOf(picked, day, locale);
  const pickedPlace =
    picked?.kind === 'place' ? (allPlaces.find((place) => place.id === picked.id) ?? null) : null;
  const { onOpenPlace } = props;
  const openPicked =
    picked?.kind === 'stop'
      ? () => props.onOpenStop(picked.id)
      : picked?.kind === 'place' && onOpenPlace !== undefined
        ? () => onOpenPlace(picked.id)
        : undefined;
  const pick = (next: Picked) => {
    setPicked(next);
    const target =
      next?.kind === 'stop'
        ? model.days.flatMap((entry) => entry.stops).find((stop) => stop.stableId === next.id)
            ?.place
        : next?.kind === 'place'
          ? allPlaces.find((place) => place.id === next.id)
          : undefined;
    if (target != null) camera.flyToPlace([target.lng, target.lat], { zoom: 14, covered: clear });
  };
  const sheetProps = {
    model,
    day,
    route,
    picked: picked?.kind === 'stop' ? picked.id : null,
    onShare: props.onShare,
    onSelectDay: (dayNo: number) => {
      setTraced(true);
      setPicked(null);
      props.onDayNo(dayNo);
    },
    onSnap: (next: MapSheetSnap) => setSnap(next, 'trip'),
    // The first tap on a row shows the stop on the map; a tap on the picked row opens it.
    onOpenStop: (stableId: string) =>
      picked?.kind === 'stop' && picked.id === stableId
        ? props.onOpenStop(stableId)
        : pick({ kind: 'stop', id: stableId }),
  };
  const daySheet = (
    <DaySheet {...sheetProps} onOpenDay={props.onOpenDay} onMoveStops={props.onMoveStops} />
  );
  const centre = model.center ?? [0, 0];
  const mapAreaHeight = size.height - sheetHeight;

  return (
    <Scaffold variant="map" edges={[]} testID="trip-map">
      <View style={StyleSheet.absoluteFill} onLayout={(event) => setSize(event.nativeEvent.layout)}>
        <TripMapLayers
          camera={camera}
          center={opening?.center ?? (day?.stay ? [day.stay.lng, day.stay.lat] : centre)}
          zoom={opening?.zoom ?? (model.empty ? 12 : 13)}
          destinationSlug={model.destinationSlug}
          placeName={snap === 'full' ? null : model.destination}
          coveredBottom={covered.bottom}
          regionUri={model.regionUri}
          stay={stay === null ? null : [stay.lng, stay.lat]}
          places={places}
          days={days}
          chosenDayNo={chosenDayNo}
          pickedStop={pickedStop}
          pickedPlace={pickedPlace}
          onPick={pick}
          onOpenPicked={openPicked}
          onRegion={(region) => setBounds(region.bounds)}
        >
          <PreviewRoute preview={preview} />
        </TripMapLayers>
        {model.empty && size.height > 0 ? (
          <View style={[styles.guide, { top: mapAreaHeight / 2 - 60 }]} pointerEvents="none">
            <FloatingGuide model={model} />
          </View>
        ) : null}
        {snap === 'full' || day === null ? null : (
          <EdgeIndicator
            stops={edgeStops(day)}
            bounds={bounds}
            size={size}
            coveredTop={covered.top}
            coveredBottom={clear.bottom}
            onPress={(id) => pick({ kind: 'stop', id })}
          />
        )}
        {snap === 'full' ? null : (
          <TripMapTop
            model={model}
            day={day}
            traced={traced}
            filter={filter}
            categories={categoryChips(allPlaces)}
            onDayChip={() => setTraced((on) => !on)}
            onFilter={setFilter}
            onBack={props.onBack}
            crewPicks={crewPicks}
          />
        )}
        <MapSheet
          snap={snap}
          initialSnap={snap}
          onSnapChange={(next) => setSnap(next)}
          accessibilityLabel={model.destination ?? ''}
          testID="trip-map-sheet"
          // Back brings a raised sheet straight down, then leaves: two presses at most.
          backCollapses="rest"
        >
          {/* As tall as the screen, so a short sheet at peek never caps how far it pulls up. */}
          <MapSheetScrollView
            contentContainerStyle={[styles.sheetBody, { minHeight: size.height }]}
          >
            {model.empty ? (
              <EmptyTripSheet model={model} />
            ) : snap === 'peek' ? (
              <PeekSheet
                {...sheetProps}
                onOpenDay={props.onOpenDay}
                head={
                  openPicked === undefined ? null : (
                    <PickedHead stop={pickedStop} place={pickedPlace} onPress={openPicked} />
                  )
                }
              />
            ) : snap === 'half' || fullShows === 'day' ? (
              daySheet
            ) : (
              <TripSheet {...sheetProps} onMoveStops={props.onMoveStops} />
            )}
          </MapSheetScrollView>
        </MapSheet>
      </View>
    </Scaffold>
  );
}
