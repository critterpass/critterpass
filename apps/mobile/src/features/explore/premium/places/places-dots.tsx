/**
 * A destination's places on the premium map, drawn like the plan map's places layer (4.34): a
 * saved place as a dot in its first saver's colour with a white ring, a place in the plan as an
 * ink dot, the guide's picks as small white dots in a green ring; places the filter leaves out at
 * 20 %, the picked one a size up. A tap picks the place. Layers, never views.
 */

import { premium, resolveMemberStyle } from '@cp/design-tokens';
import { GeoJSONSource, Layer, type PressEventWithFeatures } from '@maplibre/maplibre-react-native';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { useMemo } from 'react';
import type { NativeSyntheticEvent } from 'react-native';

import { MAP_MARKS } from '@/features/plan';

import { passesFilter, type HubPlace, type PlacesFilter } from '../../places/places-model';

interface DotProperties {
  readonly id: string;
  readonly kind: 'saved' | 'plan' | 'pick';
  readonly color: string;
  readonly lit: number;
  readonly picked: boolean;
}

export function placeDotFeatures(input: {
  readonly places: readonly HubPlace[];
  readonly filter: PlacesFilter;
  readonly pickedId: string | null;
  readonly joinIndex: ReadonlyMap<string, number>;
}): FeatureCollection<Point, DotProperties> {
  const features: Feature<Point, DotProperties>[] = input.places.map((place) => {
    const saver = place.backerIds
      .map((uid) => input.joinIndex.get(uid))
      .find((index) => index !== undefined);
    const kind = place.standing === 'plan' ? 'plan' : place.standing === 'saved' ? 'saved' : 'pick';
    return {
      type: 'Feature',
      id: place.id,
      geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
      properties: {
        id: place.id,
        kind,
        color:
          kind === 'plan'
            ? MAP_MARKS.ink
            : saver === undefined
              ? premium.accent.sky
              : resolveMemberStyle(saver).color,
        lit: passesFilter(place, input.filter) ? 1 : 0.2,
        picked: place.id === input.pickedId,
      },
    };
  });
  return { type: 'FeatureCollection', features };
}

export function PlaceDots(props: {
  readonly places: readonly HubPlace[];
  readonly filter: PlacesFilter;
  readonly pickedId: string | null;
  readonly joinIndex: ReadonlyMap<string, number>;
  readonly onPick: (placeId: string) => void;
}) {
  const { places, filter, pickedId, joinIndex, onPick } = props;
  const data = useMemo(
    () => placeDotFeatures({ places, filter, pickedId, joinIndex }),
    [places, filter, pickedId, joinIndex],
  );
  const onPress = (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const picked: unknown = event.nativeEvent.features[0]?.properties?.['id'];
    if (typeof picked !== 'string') return;
    event.stopPropagation();
    onPick(picked);
  };
  return (
    <GeoJSONSource id="cp-explore-places" data={data} onPress={onPress}>
      <Layer
        id="cp-explore-places-pick"
        type="circle"
        filter={['==', ['get', 'kind'], 'pick']}
        paint={{
          'circle-radius': ['case', ['get', 'picked'], 8, 5],
          'circle-color': MAP_MARKS.pickFill,
          'circle-stroke-color': MAP_MARKS.pickRing,
          'circle-stroke-width': 3,
          'circle-opacity': ['get', 'lit'],
          'circle-stroke-opacity': ['get', 'lit'],
        }}
      />
      <Layer
        id="cp-explore-places-mine"
        type="circle"
        filter={['!=', ['get', 'kind'], 'pick']}
        paint={{
          'circle-radius': ['case', ['get', 'picked'], 11, 8],
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
