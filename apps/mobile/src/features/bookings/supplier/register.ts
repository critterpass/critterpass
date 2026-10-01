/**
 * The supplier screens other areas open join the navigation registry (imported once by the root
 * layout): Getting around (3h-3) by trip and, when given, the drop-off place; and where to book
 * one activity (6f-1) by trip and the activity's name, on a day when the caller knows it.
 */
import { registerScreens } from '@/lib/navigation/screen-registry';

import { gettingAroundRoute, offerRoute } from './routes';

registerScreens({
  '3h-3': (params) =>
    gettingAroundRoute({
      ...(params.tripId ? { tripId: params.tripId } : {}),
      ...(params.to ? { to: params.to } : {}),
    }),
  '6f-1': (params) =>
    offerRoute({
      tripId: params.tripId ?? '',
      name: params.name ?? '',
      ...(params.date ? { date: params.date } : {}),
    }),
});
