/**
 * The plan editing screens join the navigation registry (imported once by the root layout): the
 * day view (3e-2) by trip and day number, and the live decision (3g-2) by trip and poll.
 */
import { registerScreens } from '@/lib/navigation/screen-registry';

import { dayRoute, decideRoute } from './routes';

registerScreens({
  '3e-2': (params) => dayRoute(params.tripId ?? '', Number(params.day ?? '1')),
  '3g-2': (params) => decideRoute(params.tripId ?? '', params.pollId ?? ''),
});
