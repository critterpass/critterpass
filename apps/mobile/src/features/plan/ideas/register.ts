/**
 * Ideas joins the screen registry as `7f-2` and Tokek placing them as `7h-6` (`tripId`, `jobId`).
 * Only section 7 screens link to them.
 */
import { registerScreens, type ScreenParams } from '@/lib/navigation/screen-registry';

import { ideasRoute, placingRoute } from './routes';

registerScreens({
  '7f-2': (params: ScreenParams) => ideasRoute(params['tripId'] ?? ''),
  '7h-6': (params: ScreenParams) => placingRoute(params['tripId'] ?? '', params['jobId'] ?? ''),
});
