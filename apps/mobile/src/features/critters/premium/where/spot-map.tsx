/**
 * A form's places on the premium map (undesigned; built from the plan map's canvas and marks): a
 * white pill per place with the tier's dot and the place's name, the phone's sky dot when it has a
 * position, framed so every place fits, in the light or night style.
 */
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import type { Rarity } from '@cp/critter-art';

import { PremiumMapCanvas } from '@/features/plan';
import { Text, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

import type { WhereSpot } from '../../where/where-model';
import { mapFraming } from '../../where/where-model';
import { tierAccent } from '../components/tier';

/** A phone-wide map inside the page gutters, for framing. */
const MAP_WIDTH = 350;
/** A little longer than the push, so a map mounted mid-slide on Android draws. */
const PUSH_SETTLE_MS = 520;

const useStyles = makePremiumStyles((th) => ({
  frame: { overflow: 'hidden', borderRadius: th.radius.cardLarge, boxShadow: th.shadow.card },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.float,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  you: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: th.color.card,
    backgroundColor: th.accent.sky,
  },
}));

export function PremiumSpotMap(props: {
  readonly spots: readonly WhereSpot[];
  readonly rarity: Rarity;
  readonly position: { readonly lat: number; readonly lng: number } | null;
  readonly slug: string | null;
  readonly height: number;
  readonly label: string;
  readonly testID?: string;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const camera = useRef<CameraRef>(null);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), PUSH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);
  const framing = mapFraming(props.spots, props.position, {
    width: MAP_WIDTH,
    height: props.height,
  });
  if (framing === null) return null;
  return (
    <View
      style={[styles.frame, { height: props.height, backgroundColor: th.color.control }]}
      accessibilityLabel={props.label}
      testID={props.testID}
    >
      {settled ? (
        <PremiumMapCanvas
          cameraRef={camera}
          initialCenter={[framing.center.lng, framing.center.lat]}
          initialZoom={framing.zoom}
          destinationSlug={props.slug}
        >
          {props.spots.map((spot) => (
            <Marker key={spot.key} lngLat={[spot.lng, spot.lat]} anchor="center">
              <View style={styles.pin} accessible accessibilityLabel={spot.name}>
                <View style={[styles.dot, { backgroundColor: tierAccent(th, props.rarity) }]} />
                <Text variant="badge" numberOfLines={1}>
                  {spot.name}
                </Text>
              </View>
            </Marker>
          ))}
          {props.position === null ? null : (
            <Marker lngLat={[props.position.lng, props.position.lat]} anchor="center">
              <View style={styles.you} />
            </Marker>
          )}
        </PremiumMapCanvas>
      ) : null}
    </View>
  );
}
