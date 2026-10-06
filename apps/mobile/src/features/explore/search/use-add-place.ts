/**
 * A search row's +: opens Add to plan for the place. The sheet reads the place from the phone, or
 * from the api when the phone does not hold it, so it opens at once for any place.
 */
import { router } from 'expo-router';
import { useCallback } from 'react';

import { matchPlaceRef } from './search-navigation';

export interface AddTarget {
  readonly poiId: string;
  readonly name: string;
}

export function useAddPlace(input: {
  readonly tripId: string;
  readonly destinationId: string | null;
  /** The day the search was opened for: the sheet opens on it. */
  readonly dayId?: string | undefined;
}): (target: AddTarget) => void {
  const { tripId, destinationId, dayId } = input;
  return useCallback(
    (target: AddTarget) => {
      const href = matchPlaceRef(tripId, destinationId, { poiId: target.poiId }, 'add', dayId);
      if (href !== undefined) router.push(href);
    },
    [tripId, destinationId, dayId],
  );
}
