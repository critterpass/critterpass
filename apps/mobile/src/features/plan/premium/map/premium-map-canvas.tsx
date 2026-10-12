/**
 * The premium map every plan and crew map sits on (4.25–4.39, the crew map on the trip): the
 * light or night style (following the app's appearance) over the destination's tiles, a ground
 * colour while tiles load, and whatever layers the screen puts in it (`PlanRouteLayer`,
 * `StayFlag`). The camera is the screen's: it fits what matters with `cameraPadding` for the
 * sheet's detent. Once the map has drawn the tiles in view for the current look and the
 * destination's pack (or knows there is none), a 1 pt marker (`{testID}-drawn`) is in the tree, so
 * a device run photographs a map, not its ground colour.
 */
import {
  Camera,
  Map as MapLibreMap,
  type CameraRef,
  type LngLat,
  type LngLatBounds,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useMemo, useState, type ReactNode, type RefObject } from 'react';
import { StyleSheet, View, type NativeSyntheticEvent } from 'react-native';

import { useRegionTiles, WORLD_SOURCE_URL } from '@/ui/map/region-pack';
import { usePremiumTheme } from '@/ui/premium';

import { MAP_PALETTES, type MapMode } from './palette';
import { premiumMapStyle } from './premium-map-style';

export interface MapRegion {
  readonly center: LngLat;
  readonly zoom: number;
  readonly bounds: LngLatBounds;
}

export interface PremiumMapCanvasProps {
  readonly children?: ReactNode;
  readonly cameraRef: RefObject<CameraRef | null>;
  readonly initialCenter: LngLat;
  readonly initialZoom?: number | undefined;
  /** The destination whose region pack to draw; null, or no pack yet, draws the world tiles. */
  readonly destinationSlug: string | null;
  /** The region file downloaded to this phone (`file://…pmtiles`), used instead of the network. */
  readonly localRegionUri?: string | null | undefined;
  /** Forces a look; by default the map follows the app's light or dark appearance. */
  readonly mode?: MapMode | undefined;
  /** How far above the map's foot the attribution sits (above the sheet). */
  readonly ornamentBottom?: number | undefined;
  /** No gestures (the island strip at full, mini maps). */
  readonly still?: boolean | undefined;
  readonly onRegionChange?: ((region: MapRegion) => void) | undefined;
  readonly onPressMap?: (() => void) | undefined;
  readonly testID?: string | undefined;
}

export function PremiumMapCanvas({
  children,
  cameraRef,
  initialCenter,
  initialZoom = 12,
  destinationSlug,
  localRegionUri = null,
  mode,
  ornamentBottom = 12,
  still = false,
  onRegionChange,
  onPressMap,
  testID = 'premium-map',
}: PremiumMapCanvasProps) {
  const theme = usePremiumTheme();
  const look: MapMode = mode ?? (theme.scheme === 'dark' ? 'night' : 'light');
  const tiles = useRegionTiles(destinationSlug, localRegionUri);
  const style = useMemo(() => premiumMapStyle(look, tiles.sourceUrl), [look, tiles.sourceUrl]);
  // The style the map last finished drawing: a new look or tile source draws again. While the
  // destination's pack is still being asked for, the world tiles draw nothing at street level.
  const [drawn, setDrawn] = useState<object | null>(null);
  const packKnown =
    destinationSlug === null ||
    localRegionUri !== null ||
    tiles.awaited ||
    tiles.sourceUrl !== WORLD_SOURCE_URL;
  const onRegionDidChange = (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { center, zoom, bounds } = event.nativeEvent;
    onRegionChange?.({ center, zoom, bounds });
  };
  return (
    <View style={[styles.canvas, { backgroundColor: MAP_PALETTES[look].land }]} testID={testID}>
      <MapLibreMap
        style={StyleSheet.absoluteFill}
        mapStyle={style}
        androidView="texture"
        logo={false}
        attributionPosition={{ bottom: ornamentBottom, right: 12 }}
        dragPan={!still}
        touchZoom={!still}
        touchRotate={false}
        touchPitch={false}
        onRegionDidChange={onRegionDidChange}
        {...(onPressMap === undefined ? {} : { onPress: () => onPressMap() })}
        onDidFinishRenderingMapFully={() => setDrawn(style)}
      >
        <Camera ref={cameraRef} initialViewState={{ center: initialCenter, zoom: initialZoom }} />
        {children}
      </MapLibreMap>
      {packKnown && drawn === style ? (
        <View
          pointerEvents="none"
          collapsable={false}
          style={styles.marker}
          testID={`${testID}-drawn`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1 },
  marker: { position: 'absolute', top: 0, left: 0, width: 1, height: 1 },
});
