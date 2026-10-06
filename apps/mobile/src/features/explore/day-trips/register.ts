/**
 * A day-trip area's page joins the screen registry as `day-trip` (`tripId`, `destinationId`), so
 * the plan screens and the draft review open it without knowing its path.
 */
import { registerScreens } from '@/lib/navigation/screen-registry';

import { dayTripLinks } from './links';

registerScreens({
  'day-trip': (params) => dayTripLinks.area(params['tripId'] ?? '', params['destinationId'] ?? ''),
});
