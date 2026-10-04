/**
 * The trip map (7a-1 peek, 7a-2 half, 7a-3 full; 7i-1 when nothing is saved): the map with the
 * chosen day traced from the stay, the search pill and LIST, the filter chips, edge pills for the
 * day's stops off screen, and the sheet whose content follows its snap. The camera fits the day
 * above the sheet as it settles; at half the guide's dots step aside; at full the map shrinks to
 * every day's stops. A route a sheet over the map asks for (`usePlanningMapPreview`) draws too.
 */
import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlanningMapPreview } from '@/data/plan/map-preview';
import { useLocale } from '@/lib/i18n/use-locale';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { EdgeIndicator, StopRouteLayer, usePlanningCamera } from '@/ui/map/planning';
import { MapSheet, MapSheetScrollView, type MapSheetSnap } from '@/ui/sheet/map-sheet';
import { mapSheetHeights } from '@/ui/sheet/map-sheet-snap';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

import type { DayRoute } from './day-route';
import { routeDays } from './day-route';
import { DaySheet } from './day-sheet';
import { EmptyTripSheet, FloatingGuide } from './empty-trip-sheet';
import { categoryChips, mapPlaces, NO_FILTER, type MapFilter } from './map-places';
import { PeekSheet } from './peek-sheet';
import type { TripMapModel } from './sheet-props';
import { pickedStopOf, viewPoints } from './trip-map-camera';
import { TripMapLayers, type Picked } from './trip-map-layers';
import { TripMapTop } from './trip-map-top';
import { TripSheet } from './trip-sheet';

const useStyles = makeStyles((t) => ({
  sheetBody: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['24'] },
  guide: { position: 'absolute', start: 0, end: 0, alignItems: 'center' },
}));

/** The map strip the full sheet leaves under the status bar. */
const FULL_STRIP = 64;
/** Room the search pill and chips take at the top. */
const TOP_BAR = 120;

export interface TripMapViewProps {
  readonly model: TripMapModel;
  readonly dayNo: number | null;
  readonly onDayNo: (dayNo: number) => void;
  readonly route: DayRoute;
  readonly initialSnap?: MapSheetSnap | undefined;
  readonly onShare: () => void;
  readonly onOpenDay: (dayNo: number) => void;
}

export function TripMapView(props: TripMapViewProps) {
  const styles = useStyles();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const camera = usePlanningCamera();
  const preview = usePlanningMapPreview();
  // The design draws the trip map without a back control: system back lowers the sheet, then
  // leaves; an edge swipe leaves on iOS.
  useNoBackByDesign();
  const { model, route } = props;
  const [snap, setSnap] = useState<MapSheetSnap>(
    model.empty ? 'half' : (props.initialSnap ?? 'peek'),
  );
  const [filter, setFilter] = useState<MapFilter>(NO_FILTER);
  const [traced, setTraced] = useState(true);
  const [picked, setPicked] = useState<Picked>(null);
  const [bounds, setBounds] = useState<LngLatBounds | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const day = model.days.find((entry) => entry.dayNo === props.dayNo) ?? model.days[0] ?? null;
  const heights = mapSheetHeights(size.height, insets.top + FULL_STRIP);
  const sheetHeight = snap === 'peek' ? heights[0] : snap === 'half' ? heights[1] : heights[2];
  const covered = { top: insets.top + TOP_BAR, bottom: sheetHeight };

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
  const chosenDayNo = snap === 'full' || !traced ? null : (day?.dayNo ?? null);
  const stay = day?.stay ?? null;

  // The camera follows the sheet and the chosen day once the screen has a size.
  // The map answers its first region once it can move, so the first fit waits for it.
  const fitKey = `${snap}|${String(day?.dayNo)}|${String(size.height)}|${String(bounds !== null)}`;
  useEffect(() => {
    if (size.height === 0 || bounds === null) return;
    const points = viewPoints(model, snap === 'full' ? null : day);
    if (points.length === 0) return;
    camera.fitPoints(
      points,
      snap === 'full'
        ? { top: insets.top, bottom: size.height - insets.top - FULL_STRIP }
        : covered,
    );
    // Only a new snap, day or size moves the camera; a re-read of the same plan does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const pickedStop = pickedStopOf(picked, day, locale);
  const pickedPlace =
    picked?.kind === 'place' ? (allPlaces.find((place) => place.id === picked.id) ?? null) : null;
  const pick = (next: Picked) => {
    setPicked(next);
    const target =
      next?.kind === 'stop'
        ? model.days.flatMap((entry) => entry.stops).find((stop) => stop.stableId === next.id)
            ?.place
        : next?.kind === 'place'
          ? allPlaces.find((place) => place.id === next.id)
          : undefined;
    if (target != null) camera.flyToPlace([target.lng, target.lat], { zoom: 14, covered });
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
    onSnap: setSnap,
    onOpenStop: (stableId: string) => pick({ kind: 'stop', id: stableId }),
  };
  const centre = model.center ?? [0, 0];
  const mapAreaHeight = size.height - sheetHeight;

  return (
    <Scaffold variant="map" edges={[]} testID="trip-map">
      <View style={StyleSheet.absoluteFill} onLayout={(event) => setSize(event.nativeEvent.layout)}>
        <TripMapLayers
          camera={camera}
          center={day?.stay ? [day.stay.lng, day.stay.lat] : centre}
          zoom={model.empty ? 12 : 13}
          destinationSlug={model.destinationSlug}
          regionUri={model.regionUri}
          stay={stay === null ? null : [stay.lng, stay.lat]}
          places={places}
          days={days}
          chosenDayNo={chosenDayNo}
          pickedStop={pickedStop}
          pickedPlace={pickedPlace}
          onPick={pick}
          onRegion={(region) => setBounds(region.bounds)}
        >
          {preview === null ? null : (
            <StopRouteLayer
              id="cp-preview"
              days={[
                {
                  dayNo: -1,
                  color: preview.color,
                  stops: (
                    preview.stops ??
                    preview.route.map(([lng, lat], index) => ({ key: String(index), lat, lng }))
                  ).map((stop, index) => ({
                    id: stop.key,
                    n: index + 1,
                    lat: stop.lat,
                    lng: stop.lng,
                  })),
                },
              ]}
              chosenDayNo={-1}
            />
          )}
        </TripMapLayers>
        {model.empty && size.height > 0 ? (
          <View style={[styles.guide, { top: mapAreaHeight / 2 - 60 }]} pointerEvents="none">
            <FloatingGuide model={model} />
          </View>
        ) : null}
        {snap === 'full' || day === null ? null : (
          <EdgeIndicator
            stops={day.stops.flatMap((stop, index) =>
              stop.place === null
                ? []
                : [
                    {
                      id: stop.stableId,
                      n: index + 1,
                      name: stop.title,
                      color: day.color,
                      ...stop.place,
                    },
                  ],
            )}
            bounds={bounds}
            size={size}
            coveredTop={covered.top}
            coveredBottom={covered.bottom}
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
          />
        )}
        <MapSheet
          snap={snap}
          initialSnap={snap}
          onSnapChange={setSnap}
          accessibilityLabel={model.destination ?? ''}
          testID="trip-map-sheet"
        >
          {/* As tall as the screen, so a short sheet at peek never caps how far it pulls up. */}
          <MapSheetScrollView
            contentContainerStyle={[styles.sheetBody, { minHeight: size.height }]}
          >
            {model.empty ? (
              <EmptyTripSheet model={model} />
            ) : snap === 'peek' ? (
              <PeekSheet {...sheetProps} />
            ) : snap === 'half' ? (
              <DaySheet {...sheetProps} onOpenDay={props.onOpenDay} />
            ) : (
              <TripSheet {...sheetProps} />
            )}
          </MapSheetScrollView>
        </MapSheet>
      </View>
    </Scaffold>
  );
}
