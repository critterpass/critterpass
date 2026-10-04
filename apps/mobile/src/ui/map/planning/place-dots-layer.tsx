/**
 * Places on a planning map as map layers (7c-1, 7a-1): saved places as category icons with the
 * saver's colour from town zoom, Tokek's suggestions as dots that gather into count bubbles until
 * street zoom. The map draws them all, with no view per place, so 500 places keep the frame rate.
 * Must be a child of `PlanningMapCanvas`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- MapLibre source and layer ids, never copy. */
import { tokens } from '@cp/design-tokens';
import {
  GeoJSONSource,
  Layer,
  type GeoJSONSourceRef,
  type LngLat,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import { useMemo, useRef } from 'react';
import type { NativeSyntheticEvent } from 'react-native';

import {
  CLUSTER_MAX_ZOOM,
  CLUSTER_PROPERTIES,
  CLUSTER_RADIUS,
  clusterRadius,
  litOpacity,
  placeDotFeatures,
  pressedPlaceId,
  savedRadius,
  suggestedRadius,
  TOWN_ZOOM,
  type PlaceDot,
} from './place-dots';
import { MAP_LABEL_FONT } from './map-fonts';

export interface ClusterPress {
  readonly center: LngLat;
  readonly count: number;
  /** The zoom at which the cluster splits. */
  readonly expansionZoom: number;
}

export interface PlaceDotsLayerProps {
  readonly places: readonly PlaceDot[];
  readonly onSelectPlace?: ((placeId: string) => void) | undefined;
  readonly onPressCluster?: ((cluster: ClusterPress) => void) | undefined;
  /** Prefix for the source and layer ids, unique per map. */
  readonly id?: string | undefined;
}

const { color } = tokens;

export function PlaceDotsLayer({
  places,
  onSelectPlace,
  onPressCluster,
  id = 'cp-dots',
}: PlaceDotsLayerProps) {
  const suggestedRef = useRef<GeoJSONSourceRef>(null);
  const saved = useMemo(() => placeDotFeatures(places, 'saved'), [places]);
  const suggested = useMemo(() => placeDotFeatures(places, 'suggested'), [places]);

  const onPress = (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const features = event.nativeEvent.features;
    const placeId = pressedPlaceId(features);
    if (placeId !== null) {
      event.stopPropagation();
      onSelectPlace?.(placeId);
      return;
    }
    const cluster = features.find((feature) => feature.properties?.['cluster'] === true);
    const clusterId: unknown = cluster?.properties?.['cluster_id'];
    if (
      cluster === undefined ||
      typeof clusterId !== 'number' ||
      cluster.geometry.type !== 'Point'
    ) {
      return;
    }
    event.stopPropagation();
    const [lng = 0, lat = 0] = cluster.geometry.coordinates;
    const count = Number(cluster.properties?.['point_count'] ?? 0);
    void suggestedRef.current
      ?.getClusterExpansionZoom(clusterId)
      .then((expansionZoom) => onPressCluster?.({ center: [lng, lat], count, expansionZoom }));
  };

  return (
    <>
      <GeoJSONSource
        ref={suggestedRef}
        id={`${id}-suggested`}
        data={suggested}
        cluster
        clusterRadius={CLUSTER_RADIUS}
        clusterMaxZoom={CLUSTER_MAX_ZOOM}
        clusterProperties={CLUSTER_PROPERTIES}
        onPress={onPress}
      >
        <Layer
          id={`${id}-suggested-dot`}
          type="circle"
          filter={['!', ['has', 'point_count']]}
          paint={{
            'circle-radius': suggestedRadius,
            'circle-color': color.ink[100],
            'circle-opacity': litOpacity,
          }}
        />
        <Layer
          id={`${id}-cluster`}
          type="circle"
          filter={['has', 'point_count']}
          paint={{
            'circle-radius': clusterRadius,
            'circle-color': color.ink[800],
            'circle-stroke-color': color.ink[600],
            'circle-stroke-width': 3,
            'circle-opacity': litOpacity,
            'circle-stroke-opacity': litOpacity,
          }}
        />
        <Layer
          id={`${id}-cluster-count`}
          type="symbol"
          filter={['has', 'point_count']}
          layout={{
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': [MAP_LABEL_FONT],
            'text-size': 13,
            'text-allow-overlap': true,
          }}
          paint={{ 'text-color': color.paper.base, 'text-opacity': litOpacity }}
        />
      </GeoJSONSource>
      <GeoJSONSource id={`${id}-saved`} data={saved} onPress={onPress}>
        <Layer
          id={`${id}-saved-disc`}
          type="circle"
          minzoom={TOWN_ZOOM}
          paint={{
            'circle-radius': savedRadius,
            'circle-color': color.paper.bright,
            'circle-stroke-color': color.ink[850],
            'circle-stroke-width': 2,
            'circle-opacity': litOpacity,
            'circle-stroke-opacity': litOpacity,
          }}
        />
        <Layer
          id={`${id}-saved-icon`}
          type="symbol"
          minzoom={TOWN_ZOOM}
          layout={{
            'icon-image': ['get', 'icon'],
            'icon-size': 0.8,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          }}
          paint={{ 'icon-opacity': litOpacity }}
        />
        <Layer
          id={`${id}-saved-badge`}
          type="circle"
          minzoom={TOWN_ZOOM}
          filter={['==', ['get', 'hasBadge'], true]}
          paint={{
            'circle-radius': 4.5,
            'circle-color': ['get', 'badge'],
            'circle-stroke-color': color.ink[850],
            'circle-stroke-width': 1.5,
            'circle-translate': [11, -11],
            'circle-opacity': litOpacity,
            'circle-stroke-opacity': litOpacity,
          }}
        />
      </GeoJSONSource>
    </>
  );
}
