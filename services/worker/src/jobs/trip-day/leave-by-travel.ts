/**
 * The leg a leave-by counts on: none when a pickup collects the crew, else the route from where the
 * crew sets off to the item's place (Mapbox traffic for the hour they leave), else nothing to route.
 */
import type { LeaveByLeg, RouteEtaProvider } from '@cp/domain';

import type { PlanItemRow } from './plan-items';

const MINUTE = 60_000;

export async function travelFor(
  router: RouteEtaProvider,
  item: PlanItemRow,
  arriveEarly: number,
): Promise<LeaveByLeg> {
  if (item.pickup_at !== null) {
    return {
      kind: 'pickup',
      minutes: 0,
      distance_m: null,
      mode: null,
      source: 'pickup',
      traffic: false,
      estimate: false,
    };
  }
  if (item.origin === null || item.lat === null || item.lng === null) {
    return {
      kind: 'none',
      minutes: 0,
      distance_m: null,
      mode: null,
      source: 'none',
      traffic: false,
      estimate: true,
    };
  }
  const eta = await router.eta({
    originLat: item.origin.lat,
    originLng: item.origin.lng,
    destLat: item.lat,
    destLng: item.lng,
    mode: 'auto',
    // A first guess of when the crew sets off, so predicted traffic is for the right hour.
    departAt: new Date(item.starts_at.getTime() - (arriveEarly + 60) * MINUTE),
  });
  return {
    kind: 'route',
    minutes: eta.minutes,
    distance_m: eta.distanceM,
    mode: eta.mode,
    source: eta.source,
    traffic: eta.traffic,
    estimate: eta.estimate,
  };
}
