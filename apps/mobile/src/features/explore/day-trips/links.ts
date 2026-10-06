/** Where day trips lead: an area's page inside a trip. */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import type { Href } from 'expo-router';

export const dayTripLinks = {
  area: (tripId: string, destinationId: string): Href => ({
    pathname: '/[tripId]/day-trip/[destinationId]',
    params: { tripId, destinationId },
  }),
};
