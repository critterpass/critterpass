/**
 * The GO preview's map: you as the blue dot, the place as a labelled pin, and the route between
 * them along the roads (a wide yellow line) or as a
 * straight stand-in (a thin one). The camera frames both ends,
 * or the place alone before a position is known. The destination's region tiles draw it offline.
 */
/* eslint-disable lingui/no-unlocalized-strings -- MapLibre ids and a pmtiles URL, never copy. */
import { tokens } from '@cp/design-tokens';
import type { LngLat } from '@cp/domain';
import {
  Camera,
  Map as MapLibreMap,
  Marker,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/ui/icons/Icon';
import { RouteLine } from '@/ui/map/RouteLine';
import { YouDot } from '@/ui/map/YouDot';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import criterpassDarkStyleJson from '../../../assets/map-style/critterpass-dark.json';
import type { GoPoint } from './maps-handoff';

const darkStyle = criterpassDarkStyleJson as unknown as StyleSpecification;
const WORLD_URL = (darkStyle.sources['world'] as { url: string }).url;

export interface GoMapProps {
  readonly place: GoPoint & { readonly label: string };
  readonly you: GoPoint | null;
  readonly line: readonly LngLat[] | null;
  readonly lineStraight: boolean;
  readonly destinationSlug: string | null;
  /** Room the card over the map's foot takes, so the route stays in view above it. */
  readonly bottomInset: number;
}

const useStyles = makeStyles((t) => ({
  map: { flex: 1, backgroundColor: tokens.color.map.base },
  ready: { position: 'absolute', top: 0, start: 0, width: 1, height: 1 },
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

export function GoMap({
  place,
  you,
  line,
  lineStraight,
  destinationSlug,
  bottomInset,
}: GoMapProps) {
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
  const points: readonly LngLat[] = [
    [place.lng, place.lat],
    ...(you === null ? [] : [[you.lng, you.lat] as const]),
    ...(line ?? []),
  ];
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  const bounds: [number, number, number, number] = [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ];
  const framed = points.length > 1;
  const mapKey = `${you === null ? 'place' : 'you'}:${String(line?.length ?? 0)}`;
  // The map as now framed has drawn every tile: screenshot flows wait for the marker below.
  const [renderedKey, setRenderedKey] = useState<string | null>(null);
  return (
    <View style={styles.map} testID="go-map">
      {/* Re-framed when the first position or the route arrives. */}
      <MapLibreMap
        key={mapKey}
        onDidFinishRenderingMapFully={() => setRenderedKey(mapKey)}
        style={StyleSheet.absoluteFill}
        mapStyle={style}
        androidView="texture"
        logoPosition={{ bottom: bottomInset + 8, left: 12 }}
        attributionPosition={{ bottom: bottomInset + 8, right: 12 }}
      >
        <Camera
          initialViewState={
            framed
              ? { bounds, padding: { top: 120, bottom: bottomInset + 48, left: 110, right: 110 } }
              : { center: [place.lng, place.lat], zoom: 15 }
          }
        />
        {line === null ? null : (
          <RouteLine
            id="go-route"
            coordinates={line}
            color={tokens.color.yellow}
            width={lineStraight ? 2 : 5}
          />
        )}
        {you === null ? null : (
          <Marker lngLat={[you.lng, you.lat]}>
            <View collapsable={false}>
              <YouDot />
            </View>
          </Marker>
        )}
        <Marker lngLat={[place.lng, place.lat]} anchor="bottom">
          <View style={styles.pin} collapsable={false}>
            <Icon name="pin" size={16} decorative />
            <Text variant="label" color={tokens.semantic.text.onAccent} numberOfLines={1}>
              {place.label}
            </Text>
          </View>
        </Marker>
      </MapLibreMap>
      {renderedKey === mapKey ? (
        <View style={styles.ready} collapsable={false} testID="go-map-ready" />
      ) : null}
    </View>
  );
}
