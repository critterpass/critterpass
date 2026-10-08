/**
 * The driver screens' routes and the design ids the navigation registry knows them by: the
 * directory (6e-1, with its empty state 6e-3) and a driver (6e-2), the trip's own drivers (6g-3),
 * the rate card (6g-1) and the invite (6g-2). Imported once by the root layout.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import { registerScreens } from '@/lib/navigation/screen-registry';

import { driverRoutes } from '../shared/routes';

export { driverRoutes };

registerScreens({
  '6e-1': (params) => driverRoutes.directory(params['tripId'] ?? ''),
  '6e-2': (params) => driverRoutes.detail(params['tripId'] ?? '', params['listingId'] ?? ''),
  '6g-1': (params) => driverRoutes.rate(params['tripId'] ?? '', params['providerId'] ?? ''),
  '6g-2': (params) => driverRoutes.invite(params['tripId'] ?? '', params['providerId'] ?? ''),
  '6g-3': (params) => driverRoutes.ours(params['tripId'] ?? ''),
});
