/** The live decision (3g-2) joins the navigation registry by trip and poll (imported once by the root layout). */
import { registerScreens } from '@/lib/navigation/screen-registry';

import { decideRoute } from './routes';

registerScreens({
  '3g-2': (params) => decideRoute(params.tripId ?? '', params.pollId ?? ''),
});
