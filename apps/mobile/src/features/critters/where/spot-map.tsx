/**
 * Critter spots on the app's map (an undesigned state): a pin per place, labelled with the place
 * and the rarest tier still waiting there, the phone's dot when it has a position, framed so every
 * spot fits. The destination's region tiles when the trip has a place, the world tiles otherwise.
 */
import { tokens } from '@cp/design-tokens';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { tierWord, type Tier } from '@/ui/critters/tier';
import { CpMap, type MapPlace } from '@/ui/map/CpMap';

import criterpassDarkStyleJson from '../../../../assets/map-style/critterpass-dark.json';
import { mapFraming } from './where-model';

const WORLD_URL = (
  (criterpassDarkStyleJson as { sources: Record<string, { url?: string }> }).sources['world']
    ?.url ?? ''
).replace(/^pmtiles:\/\//u, '');

export interface MapSpot {
  readonly key: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** The tier the pin names; null: everything here is found. */
  readonly tier: Tier | null;
}

export function SpotMap({
  spots,
  position,
  slug,
  foundLabel,
  height,
  testID,
}: {
  readonly spots: readonly MapSpot[];
  readonly position: { readonly lat: number; readonly lng: number } | null;
  readonly slug: string | null;
  /** The pin label of a place where everything is found. */
  readonly foundLabel: string;
  readonly height: number;
  readonly testID?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const framing = mapFraming(spots, position);
  if (framing === null) return null;
  const places: MapPlace[] = spots.map((spot) => ({
    id: spot.key,
    name: spot.name,
    iconKey: 'pin',
    categoryLabel: spot.tier === null ? foundLabel : tierWord(spot.tier),
    lat: spot.lat,
    lng: spot.lng,
  }));
  return (
    <View style={[styles.frame, { height }]} testID={testID}>
      <CpMap
        places={places}
        zoom={framing.zoom}
        initialCenter={[framing.center.lng, framing.center.lat]}
        androidTexture
        onSelectPlace={setSelected}
        {...(selected === null ? {} : { selectedPlaceId: selected })}
        {...(slug === null || WORLD_URL === ''
          ? {}
          : { regionSourceUrl: WORLD_URL.replace('/world/', `/${slug}/`) })}
        {...(position === null
          ? {}
          : {
              youLocation: [position.lng, position.lat] as [number, number],
              locationStatus: 'granted-in-destination' as const,
            })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'stretch',
    overflow: 'hidden',
    borderRadius: tokens.radius.lg,
  },
});
