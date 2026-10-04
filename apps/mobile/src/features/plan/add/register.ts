/**
 * Add to plan joins the screen registry as `7f-1` (params: `tripId`, `placeId`, and optionally
 * `day`, `start`, `after`, `source`), so the map, a card, search, a place and Ideas open the same
 * sheet. Only section 7 screens link to it, and they show only with `planning.redesign` on.
 */
import { registerScreens, type ScreenParams } from '@/lib/navigation/screen-registry';

import { addRoute } from './routes';

const day = (params: ScreenParams) => {
  const value = Number(params['day']);
  return Number.isInteger(value) && value > 0 ? value : undefined;
};

registerScreens({
  '7f-1': (params: ScreenParams) =>
    addRoute(params['tripId'] ?? '', params['placeId'] ?? '', {
      day: day(params),
      start: params['start'],
      after: params['after'],
      source: params['source'],
    }),
});
