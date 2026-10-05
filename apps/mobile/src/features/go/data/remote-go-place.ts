/**
 * GO's read of a place the phone does not hold (opened from search, a link, a push or chat): the
 * api's place, or its last good copy when there is no connection.
 */
import { useMemo } from 'react';

import { readPlace } from '@/data/places/place-read';
import { useTravelDataReader } from '@/data/travel-data/client';
import { dataOf } from '@/data/travel-data/freshness';

import type { RemoteGoPlaceReader } from './go-place';

export function useRemoteGoPlace(): RemoteGoPlaceReader {
  const reader = useTravelDataReader();
  return useMemo(
    () => async (poiId: string) => {
      const place = dataOf(await readPlace(reader, poiId));
      return place === undefined
        ? null
        : {
            id: place.id,
            name: place.name,
            lat: place.lat,
            lng: place.lng,
            address: place.address,
          };
    },
    [reader],
  );
}
