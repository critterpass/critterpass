/**
 * GO's map on the premium map: you as the sky dot, the place as a pink label pin, and the route
 * between them along the roads (a solid sky line over its casing) or as a straight stand-in (a thin
 * dotted one, never drawn as if it followed the roads). The camera frames both ends above the foot
 * card, or the place alone before a position is known.
 */
import type { LngLat } from '@cp/domain';
import { GeoJSONSource, Layer, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { MAP_PALETTES, PremiumMapCanvas } from '@/features/plan';
import { Icon, ring, Text, usePremiumReducedMotion, usePremiumTheme } from '@/ui/premium';

import type { GoPoint } from '../maps-handoff';

/** The camera keeps this much map on each side of the place and the person. */
const SIDE_PADDING = 72;
const PIN_MAX_WIDTH = 220;

export interface GoRouteMapProps {
  readonly place: GoPoint & { readonly label: string };
  readonly you: GoPoint | null;
  readonly line: readonly LngLat[] | null;
  readonly lineStraight: boolean;
  readonly destinationSlug: string | null;
  /** Room the card over the map's foot takes, so the route stays in view above it. */
  readonly bottomInset: number;
}

export function GoRouteMap({
  place,
  you,
  line,
  lineStraight,
  destinationSlug,
  bottomInset,
}: GoRouteMapProps) {
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const camera = useRef<CameraRef | null>(null);
  const palette = MAP_PALETTES[th.scheme === 'dark' ? 'night' : 'light'];
  const points: readonly LngLat[] = [
    [place.lng, place.lat],
    ...(you === null ? [] : [[you.lng, you.lat] as const]),
    ...(line ?? []),
  ];
  const signature = `${JSON.stringify(points)}:${String(bottomInset)}`;
  useEffect(() => {
    if (points.length < 2) return;
    const lngs = points.map((point) => point[0]);
    const lats = points.map((point) => point[1]);
    camera.current?.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      {
        padding: { top: 120, bottom: bottomInset + 48, left: SIDE_PADDING, right: SIDE_PADDING },
        duration: reduced ? 0 : 500,
      },
    );
    // The signature stands for the points and the inset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, reduced]);
  return (
    <PremiumMapCanvas
      cameraRef={camera}
      initialCenter={[place.lng, place.lat]}
      initialZoom={15}
      destinationSlug={destinationSlug}
      ornamentBottom={bottomInset + 8}
      testID="go-map"
    >
      {line === null ? null : (
        <GeoJSONSource
          id="go-route"
          data={{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: line.map(([lng, lat]) => [lng, lat]) },
          }}
        >
          <Layer
            id="go-route-casing"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': palette.routeCasing, 'line-width': lineStraight ? 4 : 9 }}
          />
          <Layer
            id="go-route-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': th.accent.sky,
              'line-width': lineStraight ? 2 : 5,
              ...(lineStraight ? { 'line-dasharray': [1, 2] } : {}),
            }}
          />
        </GeoJSONSource>
      )}
      {you === null ? null : (
        <Marker lngLat={[you.lng, you.lat]} anchor="center">
          <View
            collapsable={false}
            style={[
              styles.you,
              { backgroundColor: th.accent.sky, boxShadow: ring(3, th.accent.paper) },
            ]}
          />
        </Marker>
      )}
      <Marker lngLat={[place.lng, place.lat]} anchor="bottom">
        <View
          collapsable={false}
          style={[
            styles.pin,
            {
              backgroundColor: th.accent.pink,
              borderRadius: th.radius.pill,
              gap: th.space.gap4,
              boxShadow: th.shadow.sticker,
            },
          ]}
        >
          <Icon name="pin" size={14} color={th.accent.paper} />
          <Text
            variant="label"
            color={th.accent.paper}
            numberOfLines={1}
            ellipsizeMode="tail"
            singleLine={false}
            style={styles.pinLabel}
          >
            {place.label}
          </Text>
        </View>
      </Marker>
    </PremiumMapCanvas>
  );
}

const styles = StyleSheet.create({
  you: { width: 16, height: 16, borderRadius: 8 },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: PIN_MAX_WIDTH,
  },
  pinLabel: { flexShrink: 1 },
});
