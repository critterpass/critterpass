/**
 * The hand-drawn map under the crew: the CritterPass dark style with the destination's tiles,
 * trails, the dashed line from you to the meet-up, the meet-up pin, crewmates' gliding pins and
 * bunches, and your own blue dot. An approximate fix draws its 1 km circle.
 */
/* eslint-disable lingui/no-unlocalized-strings -- MapLibre ids and a pmtiles URL, never copy. */
import { tokens } from '@cp/design-tokens';
import {
  Camera,
  type CameraRef,
  Map as MapLibreMap,
  ViewAnnotation,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { RouteLine } from '@/ui/map/RouteLine';
import { YouDot } from '@/ui/map/YouDot';

import criterpassDarkStyleJson from '../../../../../assets/map-style/critterpass-dark.json';
import type { VisibleTrail } from '../data/use-trails';
import { TrailLayer } from './trail-layer';
import { useGlide, type GlidePoint } from './use-glide';

const darkStyle = criterpassDarkStyleJson as unknown as StyleSpecification;
const WORLD_URL = (darkStyle.sources['world'] as { url: string }).url;

/** The destination's published region tiles, beside the world tiles (`<base>/<slug>/tiles-v1`). */
export function regionTilesUrl(slug: string): string {
  return WORLD_URL.replace(/^pmtiles:\/\//, '').replace('/world/', `/${slug}/`);
}

export interface CanvasPin {
  readonly key: string;
  readonly target: GlidePoint;
  readonly node: ReactElement;
  /** Lift that keeps this label clear of the ones placed before it (./label-layout.ts). */
  readonly offset?: [number, number] | undefined;
  /** The label grows leftwards from its pin (near the right edge). */
  readonly flip?: boolean | undefined;
}

function GlidingPin({ pin }: { readonly pin: CanvasPin }) {
  const lngLat = useGlide(pin.target);
  return (
    <ViewAnnotation
      lngLat={lngLat}
      anchor={pin.flip === true ? 'bottom-right' : 'bottom-left'}
      offset={pin.offset ?? [0, 0]}
    >
      {pin.node}
    </ViewAnnotation>
  );
}

/** `[west, south, east, north]` around every point, or null for fewer than two. */
export function boundsOf(
  points: readonly (readonly [number, number])[],
): [number, number, number, number] | null {
  if (points.length < 2) return null;
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

export function LiveMapCanvas({
  center,
  bounds,
  padding,
  regionSourceUrl,
  pins,
  trails,
  joinIndexOf,
  meetup,
  you,
  approximateYou,
  onMeetupDragged,
  onMeetupDragStart,
}: {
  readonly center: readonly [number, number];
  /** Frames every pin, the meet-up and you when there are at least two of them. */
  readonly bounds: [number, number, number, number] | null;
  /** Keeps the framed points clear of the header and the panel. */
  readonly padding: { top: number; bottom: number; left: number; right: number };
  readonly regionSourceUrl?: string | undefined;
  readonly pins: readonly CanvasPin[];
  readonly trails: readonly VisibleTrail[];
  readonly joinIndexOf: (uid: string) => number;
  readonly meetup: {
    readonly lngLat: readonly [number, number];
    readonly node: ReactElement;
    readonly flip?: boolean | undefined;
    readonly offset?: [number, number] | undefined;
  } | null;
  readonly you: readonly [number, number] | null;
  readonly approximateYou: boolean;
  /** Dragging the meet-up pin (with a haptic tick at the start) picks a new place. */
  readonly onMeetupDragged?: ((point: { lat: number; lng: number }) => void) | undefined;
  readonly onMeetupDragStart?: (() => void) | undefined;
}) {
  const style = useMemo(
    (): StyleSpecification => ({
      ...darkStyle,
      sources: {
        ...darkStyle.sources,
        region: {
          type: 'vector',
          url: regionSourceUrl === undefined ? WORLD_URL : `pmtiles://${regionSourceUrl}`,
        },
      },
    }),
    [regionSourceUrl],
  );
  const camera = useRef<CameraRef>(null);
  // Re-frame once the panel has measured itself (its height is the bottom padding).
  useEffect(() => {
    if (bounds !== null) camera.current?.fitBounds(bounds, { padding });
    // Only a new panel height or header inset re-frames; later fixes never yank the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padding.top, padding.bottom]);
  // The attribution and logo stay visible above the panel (map data licences need both).
  const ornamentBottom = padding.bottom - 8;

  return (
    <View style={StyleSheet.absoluteFill} testID="live-map-canvas">
      <MapLibreMap
        style={StyleSheet.absoluteFill}
        mapStyle={style}
        attributionPosition={{ bottom: ornamentBottom, right: 12 }}
        logoPosition={{ bottom: ornamentBottom, left: 12 }}
      >
        <Camera
          ref={camera}
          initialViewState={
            bounds === null
              ? { center: [center[0], center[1]], zoom: 14.5, padding }
              : { bounds, padding }
          }
        />
        <TrailLayer trails={trails} joinIndexOf={joinIndexOf} />
        {you !== null && meetup !== null ? (
          <RouteLine
            id="live-you-to-meetup"
            coordinates={[you, meetup.lngLat]}
            color={tokens.color.yellow}
            dashed
          />
        ) : null}
        {meetup === null ? null : (
          <ViewAnnotation
            id="live-meetup"
            lngLat={[meetup.lngLat[0], meetup.lngLat[1]]}
            anchor={meetup.flip === true ? 'bottom-right' : 'bottom-left'}
            offset={meetup.offset ?? [0, 0]}
            draggable={onMeetupDragged !== undefined}
            {...(onMeetupDragStart === undefined ? {} : { onDragStart: onMeetupDragStart })}
            onDragEnd={(event) => {
              const [lng, lat] = event.nativeEvent.lngLat;
              onMeetupDragged?.({ lat, lng });
            }}
          >
            {meetup.node}
          </ViewAnnotation>
        )}
        {pins.map((pin) => (
          <GlidingPin key={pin.key} pin={pin} />
        ))}
        {you === null ? null : (
          <ViewAnnotation lngLat={[you[0], you[1]]}>
            <View>
              {approximateYou ? <View style={styles.approximate} /> : null}
              <YouDot />
            </View>
          </ViewAnnotation>
        )}
      </MapLibreMap>
    </View>
  );
}

const styles = StyleSheet.create({
  approximate: {
    position: 'absolute',
    width: 120,
    height: 120,
    left: -48,
    top: -48,
    borderRadius: 60,
    backgroundColor: tokens.color.blue,
    opacity: 0.18,
  },
});
