/**
 * Where a search row leads: the place (7e-1 once registered, else the place page 3d-3), and its +
 * to Add to plan (7f-1 once registered, else the place page, whose add-to-day is the existing
 * path). A dropped pin has no page: nothing opens.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design screen ids, never copy. */
import type { Href } from 'expo-router';

import { hrefFor } from '@/lib/navigation/screen-registry';

export function matchPlaceRef(
  tripId: string,
  destinationId: string | null,
  place: { readonly poiId: string | null },
  intent: 'open' | 'add',
): Href | undefined {
  if (place.poiId === null) return undefined;
  const params = {
    tripId,
    placeId: place.poiId,
    ...(destinationId === null ? {} : { destinationId }),
  };
  const add = intent === 'add' ? hrefFor('7f-1', params) : undefined;
  return add ?? hrefFor('7e-1', params) ?? hrefFor('3d-3', params);
}
