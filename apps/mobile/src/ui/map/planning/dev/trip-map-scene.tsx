/**
 * The trip map in the lab (7a-1 → 7a-3, 7c-1/7c-2): 500 places as layers, three days of stops
 * with the chosen day traced from the villa, one label for the picked place or stop, edge pills
 * for stops off screen, and the map sheet at peek, half and full over it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- lab copy, loaded only by the (dev) lab. */
import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PillButton } from '../../../buttons/PillButton';
import { Row } from '../../../layout/Row';
import { MapSheet, MapSheetScrollView, type MapSheetSnap } from '../../../sheet/map-sheet';
import { Text } from '../../../text/Text';
import { makeStyles } from '../../../theme';
import { EdgeIndicator } from '../edge-indicator';
import { MapLabel } from '../map-label';
import { PlaceDotsLayer } from '../place-dots-layer';
import { PlanningMapCanvas } from '../planning-map-canvas';
import { StopRouteLayer } from '../stop-route-layer';
import { usePlanningCamera } from '../use-planning-camera';
import { baliPlaces, LAB_DAYS, TIRTA_EMPUL, VILLA } from './bali-fixture';

const useStyles = makeStyles((t) => ({
  sheetBody: { paddingHorizontal: t.size.gutter, gap: t.space['12'], paddingBottom: t.space['24'] },
}));

type Picked = { readonly kind: 'place' | 'stop'; readonly id: string } | null;

export interface TripMapSceneProps {
  /** Extra sheet content: the kit components the lab shows under the controls. */
  readonly children?: ReactNode;
}

export function TripMapScene({ children }: TripMapSceneProps) {
  const styles = useStyles();
  const camera = usePlanningCamera();
  const allPlaces = useMemo(() => baliPlaces(500), []);
  const [savedOnly, setSavedOnly] = useState(false);
  const [dayNo, setDayNo] = useState<number | null>(3);
  const [picked, setPicked] = useState<Picked>(null);
  const [snap, setSnap] = useState<MapSheetSnap>('peek');
  const [bounds, setBounds] = useState<LngLatBounds | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const places = useMemo(
    () => allPlaces.map((place) => ({ ...place, dimmed: savedOnly && place.tier !== 'saved' })),
    [allPlaces, savedOnly],
  );
  const day = LAB_DAYS.find((entry) => entry.dayNo === dayNo);
  const place =
    picked?.kind === 'place' ? allPlaces.find((entry) => entry.id === picked.id) : undefined;
  const stop =
    picked?.kind === 'stop'
      ? LAB_DAYS.flatMap((entry) => entry.stops.map((s) => ({ ...s, day: entry }))).find(
          (entry) => entry.id === picked.id,
        )
      : undefined;

  const chooseDay = (next: number | null) => {
    setDayNo(next);
    setPicked(null);
    setSnap(next === null ? 'full' : 'half');
    const chosen = LAB_DAYS.find((entry) => entry.dayNo === next);
    const points = (chosen?.stops ?? LAB_DAYS.flatMap((entry) => entry.stops)).map(
      (s): [number, number] => [s.lng, s.lat],
    );
    camera.fitPoints([...points, VILLA], { bottom: size.height * 0.5 });
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(event) => setSize(event.nativeEvent.layout)}
      testID="planning-map-lab-trip"
    >
      <PlanningMapCanvas
        initialCenter={[TIRTA_EMPUL[0], TIRTA_EMPUL[1]]}
        initialZoom={15}
        destinationSlug="bali"
        stay={[VILLA[0], VILLA[1]]}
        cameraRef={camera.cameraRef}
        onRegionChange={(region) => setBounds(region.bounds)}
        onPressMap={() => setPicked(null)}
      >
        <PlaceDotsLayer
          places={places}
          onSelectPlace={(id) => setPicked({ kind: 'place', id })}
          onPressCluster={(cluster) => camera.openCluster(cluster.center, cluster.expansionZoom)}
        />
        <StopRouteLayer
          days={LAB_DAYS}
          chosenDayNo={dayNo}
          stay={VILLA}
          onSelectStop={(id) => setPicked({ kind: 'stop', id })}
        />
        {place === undefined ? null : (
          <MapLabel
            lngLat={[place.lng, place.lat]}
            title={place.name}
            subtitle="Saved by Alex + Rin"
            lift={18}
          />
        )}
        {stop === undefined ? null : (
          <MapLabel
            lngLat={[stop.lng, stop.lat]}
            title={stop.name}
            subtitle={`Stop ${String(stop.n)} · 14:00 · rain likely`}
            tone={{ fill: stop.day.color }}
          />
        )}
      </PlanningMapCanvas>
      <EdgeIndicator
        stops={(day?.stops ?? []).map((s) => ({ ...s, color: day?.color ?? '' }))}
        bounds={bounds}
        size={size}
        coveredTop={120}
        coveredBottom={size.height * 0.36}
        onPress={(id) => {
          const target = day?.stops.find((s) => s.id === id);
          if (target !== undefined) camera.flyToPlace([target.lng, target.lat], { zoom: 13 });
        }}
      />
      <MapSheet
        snap={snap}
        onSnapChange={setSnap}
        accessibilityLabel={day === undefined ? 'The whole trip' : `Day ${String(day.dayNo)}`}
        testID="planning-map-sheet"
      >
        <MapSheetScrollView contentContainerStyle={styles.sheetBody}>
          <Text variant="h2" testID="planning-map-lab-day-title">
            {day === undefined ? 'The whole trip' : day.title}
          </Text>
          <Text variant="eyebrow" testID={`planning-map-lab-snap-${snap}`}>{`Sheet: ${snap}`}</Text>
          {place === undefined && stop === undefined ? null : (
            <Text variant="bodySm" testID="planning-map-lab-picked">
              {`Picked: ${place?.name ?? stop?.name ?? ''}`}
            </Text>
          )}
          <Row gap="8" wrap>
            {LAB_DAYS.map((entry) => (
              <PillButton
                key={entry.dayNo}
                size="sm"
                variant={entry.dayNo === dayNo ? 'primary' : 'secondary'}
                label={`Day ${String(entry.dayNo)}`}
                onPress={() => chooseDay(entry.dayNo)}
                testID={`planning-map-lab-day-${String(entry.dayNo)}`}
              />
            ))}
            <PillButton
              size="sm"
              variant={dayNo === null ? 'primary' : 'secondary'}
              label="All days"
              onPress={() => chooseDay(null)}
              testID="planning-map-lab-all-days"
            />
            <PillButton
              size="sm"
              variant={savedOnly ? 'primary' : 'secondary'}
              label="Saved only"
              onPress={() => setSavedOnly((on) => !on)}
              testID="planning-map-lab-filter"
            />
          </Row>
          {children ??
            (day === undefined ? LAB_DAYS : [day]).flatMap((entry) =>
              entry.stops.map((s) => (
                <Text
                  key={s.id}
                  variant="rowTitle"
                >{`${String(entry.dayNo)}.${String(s.n)}  ${s.name}`}</Text>
              )),
            )}
        </MapSheetScrollView>
      </MapSheet>
    </View>
  );
}
