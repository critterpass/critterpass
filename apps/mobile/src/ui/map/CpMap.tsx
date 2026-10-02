/**
 * The reusable map surface: `critterpass-dark.json` style + PMTiles sources, doodle/avatar pins,
 * clustering, you-dot, guide sprite slot, route line, and the map-side missing states named in
 * the map spec ("Missing states"): location denied / not in destination, no results for a
 * filter, a pin with >3 avatars (delegated to `AvatarStackPin`), cluster expanded, list view, and
 * "region not downloaded offline" (an offline pack the caller hasn't supplied a local file for).
 *
 * Clustering is computed in plain JS (`clusterPlaces`, exported for direct unit testing) rather
 * than via MapLibre's native `GeoJSONSource` cluster support: pins are rich React overlays
 * (avatar stacks, category doodles, entrance motion), not simple symbol-layer icons, so the
 * cluster/expand decision has to happen before anything reaches the native map anyway.
 */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import {
  Camera,
  Map as MapLibreMap,
  ViewAnnotation,
  type LngLat,
  type LngLatBounds,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import criterpassDarkStyleJson from '../../../assets/map-style/critterpass-dark.json';

import { AvatarStackPin } from './AvatarStackPin';
import { clusterBounds, clusterPlaces, isWithinBounds, type MapPlace } from './clusterPlaces';
import { ClusterBubble } from './ClusterBubble';
import { DoodlePin } from './DoodlePin';
import { GuideSpriteSlot } from './GuideSpriteSlot';
import { RouteLine } from './RouteLine';
import type { useFlyTo } from './useFlyTo';
import { YouDot } from './YouDot';

export type { MapPlace, PlaceCluster } from './clusterPlaces';
export { clusterPlaces } from './clusterPlaces';

// The style JSON's `version` field is a plain `number` to TypeScript; MapLibre's
// `StyleSpecification` requires the literal `8` — same cast the tiles spike used (hand-verified
// against the real spec by `tools/maps/build-style.ts`'s own `validateCritterpassDarkStyle`, not
// re-validated structurally at runtime here).
const criterpassDarkStyle = criterpassDarkStyleJson as unknown as StyleSpecification;
const WORLD_SOURCE_URL = (criterpassDarkStyle.sources['world'] as { url: string }).url;

export type LocationStatus =
  'granted-in-destination' | 'granted-outside-destination' | 'denied' | 'unknown';

export interface CpMapProps {
  readonly places: readonly MapPlace[];
  readonly selectedPlaceId?: string;
  readonly onSelectPlace?: (placeId: string) => void;
  readonly zoom?: number;
  readonly initialCenter?: LngLat;
  /** Remote R2 URL or a downloaded local `file://…pmtiles` path — resolved by the caller
   *  (`apps/mobile/src/data/places/useRegionPack.ts`, T7b). Absent = world-only fallback. */
  readonly regionSourceUrl?: string;
  /** True once the caller knows a destination pack exists but neither a remote nor local source
   *  is usable right now (offline, no download yet) — the map spec's "region not downloaded offline". */
  readonly offlineUnavailable?: boolean;
  readonly youLocation?: LngLat;
  readonly locationStatus?: LocationStatus;
  readonly destinationName?: string;
  readonly destinationBounds?: LngLatBounds;
  readonly heading?: number;
  readonly guideSprite?: (heading: number) => ReactNode;
  readonly routeCoordinates?: ReadonlyArray<readonly [number, number]>;
  readonly filterActive?: boolean;
  readonly viewMode?: 'map' | 'list';
  readonly onRequestListView?: () => void;
  readonly onRequestMapView?: () => void;
  readonly flyTo?: ReturnType<typeof useFlyTo>;
}

const DEFAULT_ZOOM = 14;

export function CpMap({
  places,
  selectedPlaceId,
  onSelectPlace,
  zoom = DEFAULT_ZOOM,
  initialCenter,
  regionSourceUrl,
  offlineUnavailable = false,
  youLocation,
  locationStatus = 'unknown',
  destinationName,
  destinationBounds,
  heading = 0,
  guideSprite,
  routeCoordinates,
  filterActive = false,
  viewMode = 'map',
  onRequestListView,
  onRequestMapView,
  flyTo,
}: CpMapProps) {
  const { t } = useLingui();
  const [expandedClusterIds, setExpandedClusterIds] = useState<ReadonlySet<string>>(new Set());

  const clusters = useMemo(() => clusterPlaces(places, zoom), [places, zoom]);

  const style = useMemo((): StyleSpecification => {
    const url = offlineUnavailable ? WORLD_SOURCE_URL : (regionSourceUrl ?? WORLD_SOURCE_URL);
    return {
      ...criterpassDarkStyle,
      sources: {
        ...criterpassDarkStyle.sources,
        // A `pmtiles://` URL, not user-facing copy.
        // eslint-disable-next-line lingui/no-unlocalized-strings
        region: { type: 'vector', url: `pmtiles://${url}` },
      },
    };
  }, [regionSourceUrl, offlineUnavailable]);

  const youNotInDestination =
    locationStatus === 'granted-in-destination' &&
    youLocation !== undefined &&
    destinationBounds !== undefined &&
    !isWithinBounds(youLocation, destinationBounds);

  const noResultsText = t({ id: 'map.cpMap.noResults', message: 'No results for this filter.' });
  const mapViewLabel = t({ id: 'map.cpMap.mapViewToggle', message: 'Map view' });
  const listViewLabel = t({ id: 'map.cpMap.listViewToggle', message: 'List view' });
  const locationDeniedText = t({
    id: 'map.cpMap.locationDenied',
    message: 'Turn on location to see where you are.',
  });
  const offlineUnavailableText = t({
    id: 'map.cpMap.offlineUnavailable',
    message: 'Download this region to use the map offline.',
  });
  const resolvedDestinationName =
    destinationName ?? t({ id: 'map.cpMap.defaultDestinationName', message: 'this destination' });
  const notInDestinationText = t({
    id: 'map.cpMap.notInDestination',
    // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
    message: `You're not in ${{ destination: resolvedDestinationName }} yet.`,
  });

  if (viewMode === 'list') {
    return (
      <View style={styles.fill} testID="map-list-view">
        <FlatList
          data={places}
          keyExtractor={(place) => place.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectPlace?.(item.id)}
              style={styles.listRow}
            >
              <Text style={styles.listRowText}>{item.name}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            filterActive ? (
              <Text testID="map-no-results" style={styles.banner}>
                {noResultsText}
              </Text>
            ) : undefined
          }
        />
        <Pressable
          accessibilityRole="button"
          onPress={onRequestMapView}
          style={styles.toggleButton}
        >
          <Text style={styles.toggleButtonText}>{mapViewLabel}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.canvas}>
      <MapLibreMap
        key={offlineUnavailable ? 'offline-unavailable' : (regionSourceUrl ?? 'world-only')}
        style={styles.fill}
        mapStyle={style}
      >
        <Camera
          {...(flyTo !== undefined ? { ref: flyTo.cameraRef } : {})}
          initialViewState={{
            ...(initialCenter !== undefined ? { center: initialCenter } : {}),
            zoom,
          }}
        />

        {routeCoordinates !== undefined ? (
          <RouteLine id="cp-route" coordinates={routeCoordinates} color={tokens.color.yellow} />
        ) : null}

        {clusters.map((cluster) => {
          if (cluster.places.length === 1 || expandedClusterIds.has(cluster.id)) {
            return cluster.places.map((place) => {
              const selected = place.id === selectedPlaceId;
              return (
                <ViewAnnotation key={place.id} lngLat={[place.lng, place.lat]}>
                  {place.members !== undefined && place.members.length > 0 ? (
                    <AvatarStackPin
                      members={place.members}
                      selected={selected}
                      onPress={() => onSelectPlace?.(place.id)}
                    />
                  ) : (
                    <DoodlePin
                      name={place.name}
                      iconKey={place.iconKey}
                      categoryLabel={place.categoryLabel}
                      selected={selected}
                      onPress={() => onSelectPlace?.(place.id)}
                    />
                  )}
                </ViewAnnotation>
              );
            });
          }
          return (
            <ViewAnnotation key={cluster.id} lngLat={[cluster.lng, cluster.lat]}>
              <ClusterBubble
                count={cluster.places.length}
                onPress={() => {
                  setExpandedClusterIds((current) => new Set(current).add(cluster.id));
                  flyTo?.fitToBounds(clusterBounds(cluster));
                }}
              />
            </ViewAnnotation>
          );
        })}

        {locationStatus === 'granted-in-destination' &&
        youLocation !== undefined &&
        !youNotInDestination ? (
          <ViewAnnotation lngLat={youLocation}>
            {guideSprite !== undefined ? (
              <View style={styles.youRow}>
                <YouDot />
                <GuideSpriteSlot heading={heading}>{guideSprite}</GuideSpriteSlot>
              </View>
            ) : (
              <YouDot />
            )}
          </ViewAnnotation>
        ) : null}
      </MapLibreMap>

      {locationStatus === 'denied' ? (
        <Text testID="map-location-denied" style={styles.banner}>
          {locationDeniedText}
        </Text>
      ) : null}
      {youNotInDestination ? (
        <Text testID="map-not-in-destination" style={styles.banner}>
          {notInDestinationText}
        </Text>
      ) : null}
      {offlineUnavailable ? (
        <Text testID="map-offline-unavailable" style={styles.banner}>
          {offlineUnavailableText}
        </Text>
      ) : null}
      {places.length === 0 && filterActive ? (
        <Text testID="map-no-results" style={styles.banner}>
          {noResultsText}
        </Text>
      ) : null}

      {onRequestListView === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={onRequestListView}
          style={styles.toggleButton}
        >
          <Text style={styles.toggleButtonText}>{listViewLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Until tiles draw (slow network, or none), the map shows the app's own surface, never black.
  canvas: { flex: 1, backgroundColor: tokens.semantic.bg.base },
  youRow: { flexDirection: 'row', alignItems: 'center' },
  banner: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    backgroundColor: tokens.color.ink[800],
    color: tokens.color.paper.base,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: tokens.color.ink[800],
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  toggleButtonText: { color: tokens.color.paper.base, fontSize: tokens.type.body.sm.fontSize },
  listRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: tokens.color.ink[700] },
  listRowText: { color: tokens.color.paper.base },
});
