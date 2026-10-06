/**
 * The planning place page joins the screen registry as `7e-1`. It lives on the place route itself
 * (`/explore/place/[placeId]`), so `3d-3` links, shares and pushes reach it with no change to their
 * registration.
 */
import { registerScreens } from '@/lib/navigation/screen-registry';

import { exploreRoutes } from '../routes';

registerScreens({
  '7e-1': (params) =>
    exploreRoutes.place(params['placeId'] ?? '', {
      destinationId: params['destinationId'],
      tripId: params['tripId'],
    }),
});
