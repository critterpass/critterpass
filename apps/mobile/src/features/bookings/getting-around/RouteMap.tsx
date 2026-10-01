/**
 * Getting around's map (3h-3): the pickup as a dot, the drop-off as a labelled pin, a dashed line
 * between them and, only after "I'm in the car", a car placed by elapsed time along that line
 * (an estimate, never a tracked position). The destination's region tiles draw it offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- MapLibre ids and a pmtiles URL, never copy. */
import {
  Camera,
  Map as MapLibreMap,
  ViewAnnotation,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { Icon } from '@/ui/icons/Icon';
import { RouteLine } from '@/ui/map/RouteLine';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import criterpassDarkStyleJson from '../../../../assets/map-style/critterpass-dark.json';

const darkStyle = criterpassDarkStyleJson as unknown as StyleSpecification;
const WORLD_URL = (darkStyle.sources['world'] as { url: string }).url;
const DOT = 26;
const CAR = 44;

export interface LngLatPoint {
  readonly lat: number;
  readonly lng: number;
}

export interface RouteMapProps {
  readonly from: LngLatPoint | null;
  readonly to: LngLatPoint & { readonly label: string };
  readonly destinationSlug: string | null;
  /** 0–1 along the line while an estimated journey runs; null before and after. */
  readonly carShare: number | null;
  readonly height: number;
}

const useStyles = makeStyles((t) => ({
  map: { backgroundColor: tokens.color.map.base, overflow: 'hidden' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: t.color.blue,
    borderWidth: 3,
    borderColor: t.color.paper.base,
  },
  car: {
    width: CAR,
    height: CAR,
    borderRadius: CAR / 2,
    backgroundColor: t.color.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['4'],
    backgroundColor: t.color.pink,
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
  },
}));

export function RouteMap({ from, to, destinationSlug, carShare, height }: RouteMapProps) {
  const styles = useStyles();
  const style = useMemo((): StyleSpecification => {
    const region =
      destinationSlug === null
        ? WORLD_URL
        : `pmtiles://${WORLD_URL.replace(/^pmtiles:\/\//u, '').replace('/world/', `/${destinationSlug}/`)}`;
    return {
      ...darkStyle,
      sources: { ...darkStyle.sources, region: { type: 'vector', url: region } },
    };
  }, [destinationSlug]);
  const line: [number, number][] = from
    ? [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ]
    : [];
  const car =
    from && carShare !== null
      ? {
          lng: from.lng + (to.lng - from.lng) * carShare,
          lat: from.lat + (to.lat - from.lat) * carShare,
        }
      : null;
  const bounds: [number, number, number, number] | null = from
    ? [
        Math.min(from.lng, to.lng),
        Math.min(from.lat, to.lat),
        Math.max(from.lng, to.lng),
        Math.max(from.lat, to.lat),
      ]
    : null;
  return (
    <View style={[styles.map, { height }]} testID="getting-around-map">
      <MapLibreMap style={StyleSheet.absoluteFill} mapStyle={style}>
        <Camera
          initialViewState={
            bounds
              ? { bounds, padding: { top: 90, bottom: 40, left: 50, right: 50 } }
              : { center: [to.lng, to.lat], zoom: 14 }
          }
        />
        {line.length === 2 ? (
          <RouteLine id="getting-around" coordinates={line} color={tokens.color.yellow} dashed />
        ) : null}
        {from ? (
          <ViewAnnotation lngLat={[from.lng, from.lat]} anchor="center">
            <View style={styles.dot} collapsable={false} />
          </ViewAnnotation>
        ) : null}
        {car ? (
          <ViewAnnotation lngLat={[car.lng, car.lat]} anchor="center">
            <View style={styles.car} collapsable={false}>
              <Icon name="car" size={28} decorative />
            </View>
          </ViewAnnotation>
        ) : null}
        <ViewAnnotation lngLat={[to.lng, to.lat]} anchor="bottom">
          <View style={styles.pin} collapsable={false}>
            <Icon name="pin" size={16} decorative />
            <Text variant="label" color={tokens.semantic.text.onAccent} numberOfLines={1}>
              {to.label}
            </Text>
          </View>
        </ViewAnnotation>
      </MapLibreMap>
    </View>
  );
}
