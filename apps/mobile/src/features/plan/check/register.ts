/**
 * The plan check joins the screen registry: `7h-1` (`tripId`), Fill a gap `7h-2` (`tripId`,
 * `dayId`, `start`, `end`), Less driving `7h-3` and Rain and crowds `7h-4` (`tripId`, `dayId`), and
 * Balance the crew `7h-5` (`tripId`, organisers only). The private ask's inbox row registers its
 * renderer here too.
 */
import { registerScreens, type ScreenParams } from '@/lib/navigation/screen-registry';

import { registerAskInboxRenderer } from './ask-inbox';
import { checkRoutes } from './routes';

const param = (params: ScreenParams, key: string) => params[key] ?? '';

registerScreens({
  '7h-1': (params: ScreenParams) => checkRoutes.check(param(params, 'tripId')),
  '7h-2': (params: ScreenParams) =>
    checkRoutes.gap(param(params, 'tripId'), {
      dayId: param(params, 'dayId'),
      start: param(params, 'start'),
      end: param(params, 'end'),
    }),
  '7h-3': (params: ScreenParams) =>
    checkRoutes.lessDriving(param(params, 'tripId'), param(params, 'dayId')),
  '7h-4': (params: ScreenParams) =>
    checkRoutes.rain(param(params, 'tripId'), param(params, 'dayId')),
  '7h-5': (params: ScreenParams) => checkRoutes.balance(param(params, 'tripId')),
});

registerAskInboxRenderer();
