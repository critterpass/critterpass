/**
 * The trip map, the day plan and all days join the navigation registry (imported by the planning
 * register). `plan-hub` has no design render: it is what the trip's PLAN opens (`/{tripId}/plan`,
 * the trip map or a day plan as `plan.hub` says), which hub tiles, inbox rows and proposal links
 * open by name.
 */
import { registerScreens, type ScreenParams } from '@/lib/navigation/screen-registry';

import { tripPlanRoutes } from './routes';

const trip = (params: ScreenParams) => params['tripId'] ?? '';
const day = (params: ScreenParams) => Number(params['day'] ?? '1') || 1;
const optionalDay = (params: ScreenParams) =>
  params['day'] === undefined ? undefined : day(params);

registerScreens({
  'plan-hub': (params) => tripPlanRoutes.hub(trip(params)),
  '7a-1': (params) => tripPlanRoutes.map(trip(params), { day: optionalDay(params) }),
  '7a-2': (params) => tripPlanRoutes.map(trip(params), { day: optionalDay(params), sheet: 'half' }),
  '7a-3': (params) => tripPlanRoutes.map(trip(params), { sheet: 'full' }),
  '7b-1': (params) => tripPlanRoutes.day(trip(params), day(params), params['item']),
  '7b-2': (params) => tripPlanRoutes.dayMap(trip(params), day(params)),
  '7b-3': (params) => tripPlanRoutes.days(trip(params)),
  '7i-1': (params) => tripPlanRoutes.map(trip(params)),
});
