/**
 * The album area's routes and the design ids the navigation registry knows them by: the crew's
 * album (3m-2), one photo full screen, the postcard composer (3m-9, the recap's last card) and the
 * traveller's own postal address for printed postcards. Imported once by the root layout.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

export const albumRoutes = {
  album: (tripId: string): Href => ({ pathname: '/album/[tripId]', params: { tripId } }),
  photo: (tripId: string, photoId: string): Href => ({
    pathname: '/album/[tripId]/[photoId]',
    params: { tripId, photoId },
  }),
  postcard: (tripId: string): Href => ({
    pathname: '/recap/[tripId]/postcard',
    params: { tripId },
  }),
  address: (): Href => '/album/address',
};

registerScreens({
  '3m-2': (params) => albumRoutes.album(params['tripId'] ?? ''),
  '3m-9': (params) => albumRoutes.postcard(params['tripId'] ?? ''),
});
