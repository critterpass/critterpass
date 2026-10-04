/**
 * The trip map, the day plan and all days join the navigation registry (imported by the planning
 * register, after every earlier feature). The plan overview (3e-1) and the day view (3e-2) keep
 * their registrations: their paths (`/{tripId}/plan`, `/{tripId}/day/{n}`) are the routes that
 * read `planning.redesign` when they open, so a hub tile, an inbox row, a push or a proposal link
 * lands on the section 7 screen with the switch on and on the earlier one with it off.
 */
import { registerScreens, type ScreenParams } from '@/lib/navigation/screen-registry';

import { tripPlanRoutes } from './routes';

const trip = (params: ScreenParams) => params['tripId'] ?? '';
const day = (params: ScreenParams) => Number(params['day'] ?? '1') || 1;
const optionalDay = (params: ScreenParams) =>
  params['day'] === undefined ? undefined : day(params);

registerScreens({
  '7a-1': (params) => tripPlanRoutes.map(trip(params), { day: optionalDay(params) }),
  '7a-2': (params) => tripPlanRoutes.map(trip(params), { day: optionalDay(params), sheet: 'half' }),
  '7a-3': (params) => tripPlanRoutes.map(trip(params), { sheet: 'full' }),
  '7b-1': (params) => tripPlanRoutes.day(trip(params), day(params), params['item']),
  '7b-2': (params) => tripPlanRoutes.dayMap(trip(params), day(params)),
  '7b-3': (params) => tripPlanRoutes.days(trip(params)),
  '7i-1': (params) => tripPlanRoutes.map(trip(params)),
});
