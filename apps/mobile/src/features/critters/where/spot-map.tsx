/**
 * Critter spots on the app's map (an undesigned state): a pin per place, labelled with the place
 * and the rarest tier still waiting there, the phone's dot when it has a position, framed so every
 * spot fits. The destination's region tiles when the trip has a place, the world tiles otherwise.
 */
import { tokens } from '@cp/design-tokens';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { tierWord, type Tier } from '@/ui/critters/tier';
import { CpMap, type MapPlace } from '@/ui/map/CpMap';

import { mapFraming } from './where-model';
import { plainTilesUrl, useRegionTiles } from '@/ui/map/region-pack';
import { RegionPackNotice } from '@/ui/map/RegionPackNotice';

/** A phone-wide map inside the page gutters, for framing (the narrowest phones are about this). */
const MAP_WIDTH = 340;

/** A little longer than the push transition's 480 ms enter. */
const PUSH_SETTLE_MS = 520;

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
  placeName,
  foundLabel,
  height,
  testID,
}: {
  readonly spots: readonly MapSpot[];
  readonly position: { readonly lat: number; readonly lng: number } | null;
  readonly slug: string | null;
  /** The destination's name, for the line a destination without a region pack shows. */
  readonly placeName?: string | null | undefined;
  /** The pin label of a place where everything is found. */
  readonly foundLabel: string;
  readonly height: number;
  readonly testID?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const tiles = useRegionTiles(slug, null);
  // On Android a map in a pushed screen mounted mid-slide drew nothing: it waits out the push.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), PUSH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);
  const framing = mapFraming(spots, position, { width: MAP_WIDTH, height });
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
    <View>
      <View style={[styles.frame, { height }]} testID={testID}>
        {settled ? (
          <CpMap
            places={places}
            zoom={framing.zoom}
            initialCenter={[framing.center.lng, framing.center.lat]}
            androidTexture
            onSelectPlace={setSelected}
            {...(selected === null ? {} : { selectedPlaceId: selected })}
            regionSourceUrl={plainTilesUrl(tiles)}
            {...(position === null
              ? {}
              : {
                  youLocation: [position.lng, position.lat] as [number, number],
                  locationStatus: 'granted-in-destination' as const,
                })}
          />
        ) : null}
      </View>
      {/* The framed map is too small to carry the line over its pins: it goes underneath. */}
      {tiles.awaited && placeName ? <RegionPackNotice place={placeName} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'stretch',
    overflow: 'hidden',
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.semantic.bg.raised,
  },
});
