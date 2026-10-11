/**
 * Saved places and the guide's picks on the premium plan map (4.25, 4.34): a saved place as a dot
 * in its saver's colour with a white ring, the guide's picks as small white dots in a green ring;
 * places a filter chip leaves out at 20%. A tap picks the place. Layers, never views.
 */
/* eslint-disable lingui/no-unlocalized-strings -- MapLibre ids and wire values, never copy. */
import { GeoJSONSource, Layer, type PressEventWithFeatures } from '@maplibre/maplibre-react-native';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { useMemo } from 'react';
import type { NativeSyntheticEvent } from 'react-native';

import { premium } from '@cp/design-tokens';

import type { MapPlace } from '../../trip-map/map-places';
import { MAP_MARKS } from '../map';

interface PlaceProperties {
  readonly id: string;
  readonly saved: boolean;
  readonly color: string;
  readonly lit: number;
}

export function placeFeatures(
  places: readonly MapPlace[],
): FeatureCollection<Point, PlaceProperties> {
  const features: Feature<Point, PlaceProperties>[] = places.map((place) => ({
    type: 'Feature',
    id: place.id,
    geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
    properties: {
      id: place.id,
      saved: place.tier === 'saved',
      color: place.badgeColor ?? premium.accent.sky,
      lit: place.dimmed === true ? 0.2 : 1,
    },
  }));
  return { type: 'FeatureCollection', features };
}

export function PlacesLayer({
  places,
  onPick,
  id = 'cp-places',
}: {
  readonly places: readonly MapPlace[];
  readonly onPick: (placeId: string) => void;
  readonly id?: string;
}) {
  const data = useMemo(() => placeFeatures(places), [places]);
  const onPress = (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const picked = event.nativeEvent.features[0]?.properties?.['id'];
    if (typeof picked !== 'string') return;
    event.stopPropagation();
    onPick(picked);
  };
  return (
    <GeoJSONSource id={id} data={data} onPress={onPress}>
      <Layer
        id={`${id}-pick`}
        type="circle"
        filter={['!', ['get', 'saved']]}
        minzoom={11}
        paint={{
          'circle-radius': 5,
          'circle-color': MAP_MARKS.pickFill,
          'circle-stroke-color': MAP_MARKS.pickRing,
          'circle-stroke-width': 3,
          'circle-opacity': ['get', 'lit'],
          'circle-stroke-opacity': ['get', 'lit'],
        }}
      />
      <Layer
        id={`${id}-saved`}
        type="circle"
        filter={['get', 'saved']}
        paint={{
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': MAP_MARKS.pinRing,
          'circle-stroke-width': 2.5,
          'circle-opacity': ['get', 'lit'],
          'circle-stroke-opacity': ['get', 'lit'],
        }}
      />
    </GeoJSONSource>
  );
}
