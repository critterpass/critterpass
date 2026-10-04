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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { noticeBottom, RegionPackNotice } from '../RegionPackNotice';
import { useRegionTiles } from '../region-pack';
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
  /** The destination whose region pack to draw; null, or no pack yet, draws the world tiles. */
  readonly destinationSlug: string | null;
  /** The destination's name; with it, a destination without a pack says its map is on its way. */
  readonly placeName?: string | null | undefined;
  /** How much of the map's foot a sheet covers: that line sits above it. */
  readonly coveredBottom?: number | undefined;
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
  /** A small inset map (the day plan's mini-map): no logo, the attribution "i" at the bottom right. */
  readonly compact?: boolean | undefined;
  /** The MapLibre mark; off on a compact map, and where the screen's own chrome fills the foot. */
  readonly logo?: boolean | undefined;
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
  placeName,
  coveredBottom,
  localRegionUri = null,
  stay,
  cameraRef,
  ornamentBottom = ORNAMENT_SIDE,
  onRegionChange,
  onPressMap,
  onFrame,
  testID = 'planning-map',
  compact = false,
  logo = !compact,
}: PlanningMapCanvasProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const tiles = useRegionTiles(destinationSlug, localRegionUri);
  const style = useMemo(() => planningMapStyle(tiles.sourceUrl), [tiles.sourceUrl]);
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
        logo={logo}
        logoPosition={{ bottom: ornamentBottom, left: ORNAMENT_SIDE }}
        attributionPosition={
          compact ? { bottom: 4, right: 4 } : { bottom: ornamentBottom, right: ORNAMENT_SIDE }
        }
        onRegionDidChange={onRegionDidChange}
        {...(onPressMap === undefined ? {} : { onPress: () => onPressMap() })}
        {...(onFrame === undefined ? {} : { onDidFinishRenderingFrame: () => onFrame() })}
      >
        <Camera ref={cameraRef} initialViewState={{ center: initialCenter, zoom: initialZoom }} />
        {children}
        {stay === null || stay === undefined ? null : <StayMarker lngLat={stay} />}
      </MapLibreMap>
      {tiles.awaited && !compact && placeName ? (
        <RegionPackNotice
          place={placeName}
          bottom={noticeBottom({ ornamentBottom, insetBottom: insets.bottom, coveredBottom })}
        />
      ) : null}
    </View>
  );
}
