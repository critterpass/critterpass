/**
 * The Explore map itself: the hand-drawn dark style over the destination's tiles (the region file
 * on this phone when there is one), a doodle pin per place with nearby ones gathered into "+n"
 * bubbles that follow the zoom, the you-dot with the guide beside it, and a dotted line from there
 * to the chosen place. It is mounted once the place to open on is known, so the camera starts there.
 */
/* eslint-disable lingui/no-unlocalized-strings -- MapLibre ids, never copy. */
import {
  Camera,
  Map as MapLibreMap,
  ViewAnnotation,
  type CameraRef,
  type LngLatBounds,
} from '@maplibre/maplibre-react-native';
import { useMemo, useState, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clusterBounds, clusterPlaces, type MapPlace } from '@/ui/map/clusterPlaces';
import { regionMapStyle, useRegionTiles } from '@/ui/map/region-pack';
import { noticeBottom, RegionPackNotice } from '@/ui/map/RegionPackNotice';
import { RouteLine } from '@/ui/map/RouteLine';
import { YouDot } from '@/ui/map/YouDot';
import { useTheme } from '@/ui/theme';

import type { GuideFacts } from '../format';
import type { Point } from '../map-model';
import { DoodlePin, type PinFace } from './doodle-pin';
import { GuideSprite } from './guide-sprite';
import { PinCluster } from './pin-cluster';

export const OPENING_ZOOM = 12;
/** Name capsules are wide: places nearer than this on screen share one bubble. */
const GATHER_PX = 96;
const ORNAMENT_SIDE = 12;

export interface CanvasPlace {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly faces: readonly PinFace[];
}

export interface ExploreMapCanvasProps {
  readonly places: readonly CanvasPlace[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly centre: Point;
  readonly destinationSlug: string | null;
  /** The destination's name, for the line a destination without a region pack shows. */
  readonly destinationName: string;
  /** The downloaded region (`file://…pmtiles`), used instead of the network. */
  readonly localRegionUri: string | null;
  /** Where the viewer stands, when they are in the destination. */
  readonly you: Point | null;
  readonly guide: GuideFacts;
  /** How far above the bottom edge the map's mark and attribution button sit, in points. */
  readonly ornamentBottom: number;
  /** The camera the screen flies (`useFlyTo`). */
  readonly cameraRef: RefObject<CameraRef | null>;
  /** Zooms to fit a gathering that was tapped open. */
  readonly onFit: (bounds: LngLatBounds) => void;
}

const styles = StyleSheet.create({ sprite: { width: 48, height: 48 } });

export function ExploreMapCanvas({ cameraRef, onFit, ...props }: ExploreMapCanvasProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [zoom, setZoom] = useState(OPENING_ZOOM);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const tiles = useRegionTiles(props.destinationSlug, props.localRegionUri);
  const style = useMemo(() => regionMapStyle(tiles.sourceUrl), [tiles.sourceUrl]);

  const byId = useMemo(
    () => new Map(props.places.map((place) => [place.id, place])),
    [props.places],
  );
  const clusters = useMemo(
    () =>
      clusterPlaces(
        props.places.map((place): MapPlace => ({
          id: place.id,
          name: place.name,
          iconKey: place.category,
          categoryLabel: place.category,
          lat: place.lat,
          lng: place.lng,
        })),
        // Whole zoom steps: the gathering only changes when the map has really zoomed.
        Math.round(zoom),
        GATHER_PX,
      ),
    [props.places, zoom],
  );
  const selected = props.selectedId === null ? undefined : byId.get(props.selectedId);
  return (
    <>
      <MapLibreMap
        style={StyleSheet.absoluteFill}
        mapStyle={style}
        // Drawn inside the view tree, so no band of the map's surface is left behind a screen that
        // replaces it.
        androidView="texture"
        logoPosition={{ bottom: props.ornamentBottom, left: ORNAMENT_SIDE }}
        attributionPosition={{ bottom: props.ornamentBottom, right: ORNAMENT_SIDE }}
        onRegionDidChange={(event) => setZoom(event.nativeEvent.zoom)}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: [props.centre.lng, props.centre.lat],
            zoom: OPENING_ZOOM,
          }}
        />
        {props.you !== null && selected !== undefined ? (
          <RouteLine
            id="explore-you-to-place"
            coordinates={[
              [props.you.lng, props.you.lat],
              [selected.lng, selected.lat],
            ]}
            color={theme.semantic.action.primary}
            dashed
          />
        ) : null}
        {clusters.map((cluster) => {
          // The chosen place is always its own pin, even inside a gathering.
          const single =
            cluster.places.length === 1 ||
            opened.has(cluster.id) ||
            cluster.places.some((place) => place.id === props.selectedId);
          if (!single) {
            return (
              <ViewAnnotation key={cluster.id} lngLat={[cluster.lng, cluster.lat]} anchor="center">
                <PinCluster
                  count={cluster.places.length}
                  onPress={() => {
                    setOpened((current) => new Set(current).add(cluster.id));
                    onFit(clusterBounds(cluster));
                  }}
                />
              </ViewAnnotation>
            );
          }
          return cluster.places.map((entry) => {
            const place = byId.get(entry.id);
            if (place === undefined) return null;
            return (
              <ViewAnnotation
                // The annotation is a picture of the pin: a new one is taken when it is chosen.
                key={place.id === props.selectedId ? `${place.id}-chosen` : place.id}
                lngLat={[place.lng, place.lat]}
                anchor="center"
              >
                <DoodlePin
                  id={place.id}
                  name={place.name}
                  category={place.category}
                  faces={place.faces}
                  selected={place.id === props.selectedId}
                  onPress={() => props.onSelect(place.id)}
                />
              </ViewAnnotation>
            );
          });
        })}
        {props.you === null ? null : (
          <ViewAnnotation lngLat={[props.you.lng, props.you.lat]}>
            <View>
              <YouDot />
            </View>
          </ViewAnnotation>
        )}
        {props.you === null ? null : (
          <ViewAnnotation lngLat={[props.you.lng, props.you.lat]} anchor="right" offset={[-10, 0]}>
            <View style={styles.sprite} collapsable={false}>
              <GuideSprite guide={props.guide} />
            </View>
          </ViewAnnotation>
        )}
      </MapLibreMap>
      {tiles.awaited && props.destinationName !== '' ? (
        <RegionPackNotice
          place={props.destinationName}
          bottom={noticeBottom({
            ornamentBottom: props.ornamentBottom,
            insetBottom: insets.bottom,
          })}
        />
      ) : null}
    </>
  );
}
