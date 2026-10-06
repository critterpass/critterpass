/**
 * Review changes joins the screen registry as `7h-7` (`tripId`, `changesetId`): the same route as
 * the earlier review (3e-3), whose screen shows the section 7 layout, so trip cards, pushes, inbox
 * rows and chat cards that open 3e-3 land on it too.
 */
import { registerScreens, type ScreenParams } from '@/lib/navigation/screen-registry';

import { planRoutes } from '../overview/routes';

registerScreens({
  '7h-7': (params: ScreenParams) =>
    planRoutes.review(params['tripId'] ?? '', params['changesetId'] ?? ''),
});
