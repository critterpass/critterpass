/**
 * Getting around joins the navigation registry (imported once by the root layout): 3h-3 by trip
 * and, when given, the drop-off place.
 */
import { registerScreens } from '@/lib/navigation/screen-registry';

import { gettingAroundRoute } from './routes';

registerScreens({
  '3h-3': (params) =>
    gettingAroundRoute({
      ...(params.tripId ? { tripId: params.tripId } : {}),
      ...(params.to ? { to: params.to } : {}),
    }),
});
