/**
 * The live map every section 7 planning screen sits on (trip map, day plan, places): the dark
 * style over the destination's tiles, the stay marker, and whatever layers the screen puts in it
 * (`PlaceDotsLayer`, `StopRouteLayer`, one `MapLabel`). Places and stops are map layers, never a
 * view each, so a crowded map pans like an empty one.
 */
import {
  Camera,
  Map as MapLibreMap,
  type LngLat,
  type LngLatBounds,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useMemo, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import type { CameraRef } from '@maplibre/maplibre-react-native';

import { makeStyles } from '../../theme';
import { planningMapStyle } from './map-style';
import { StayMarker } from './stay-marker';

const ORNAMENT_SIDE = 12;

export interface MapRegion {
  readonly center: LngLat;
  readonly zoom: number;
  readonly bounds: LngLatBounds;
}

export interface PlanningMapCanvasProps {
  readonly children?: ReactNode;
  readonly initialCenter: LngLat;
  readonly initialZoom?: number | undefined;
  /** The destination whose region tiles to draw; null draws the world tiles. */
  readonly destinationSlug: string | null;
  /** The region file downloaded to this phone (`file://…pmtiles`), used instead of the network. */
  readonly localRegionUri?: string | null | undefined;
  readonly stay?: LngLat | null | undefined;
  readonly cameraRef: RefObject<CameraRef | null>;
  /** How far above the map's foot its mark and attribution sit (above a sheet's peek). */
  readonly ornamentBottom?: number | undefined;
  /** Every settled camera move: zoom tiers, edge pills, "86 places in view". */
  readonly onRegionChange?: ((region: MapRegion) => void) | undefined;
  /** A tap on the map away from any place: clears the picked place. */
  readonly onPressMap?: (() => void) | undefined;
  /** Each frame the map draws (the lab's frame meter). */
  readonly onFrame?: (() => void) | undefined;
  readonly testID?: string | undefined;
}

const useStyles = makeStyles((t) => ({
  // Until tiles draw, the map shows the app's own surface, never black.
  canvas: { flex: 1, backgroundColor: t.semantic.bg.base },
}));

export function PlanningMapCanvas({
  children,
  initialCenter,
  initialZoom = 13,
  destinationSlug,
  localRegionUri = null,
  stay,
  cameraRef,
  ornamentBottom = ORNAMENT_SIDE,
  onRegionChange,
  onPressMap,
  onFrame,
  testID = 'planning-map',
}: PlanningMapCanvasProps) {
  const styles = useStyles();
  const style = useMemo(
    () => planningMapStyle(destinationSlug, localRegionUri),
    [destinationSlug, localRegionUri],
  );
  const onRegionDidChange = (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { center, zoom, bounds } = event.nativeEvent;
    onRegionChange?.({ center, zoom, bounds });
  };
  return (
    <View style={styles.canvas} testID={testID}>
      <MapLibreMap
        style={StyleSheet.absoluteFill}
        mapStyle={style}
        // Drawn inside the view tree, so a pushed screen never leaves a band of map behind it.
        androidView="texture"
        logoPosition={{ bottom: ornamentBottom, left: ORNAMENT_SIDE }}
        attributionPosition={{ bottom: ornamentBottom, right: ORNAMENT_SIDE }}
        onRegionDidChange={onRegionDidChange}
        {...(onPressMap === undefined ? {} : { onPress: () => onPressMap() })}
        {...(onFrame === undefined ? {} : { onDidFinishRenderingFrame: () => onFrame() })}
      >
        <Camera ref={cameraRef} initialViewState={{ center: initialCenter, zoom: initialZoom }} />
        {children}
        {stay === null || stay === undefined ? null : <StayMarker lngLat={stay} />}
      </MapLibreMap>
    </View>
  );
}
