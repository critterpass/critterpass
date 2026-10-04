export {
  createValhallaClient,
  VALHALLA_MAX_MATRIX_SIDE,
  type ValhallaClient,
  type ValhallaClientOptions,
  type ValhallaCosting,
  type ValhallaLeg,
  type ValhallaLocation,
  type ValhallaMatrix,
  type ValhallaOptimizedRoute,
  type ValhallaPoint,
  type ValhallaRoute,
  type ValhallaRouteLeg,
} from './client';
export { createCircuitBreaker, type CircuitBreaker, type CircuitBreakerOptions } from './breaker';
export { ValhallaError, type ValhallaErrorKind } from './errors';
export {
  createPlanningTravel,
  straightLineTravel,
  toMinutes,
  type PlanningTravel,
  type PlanningTravelMode,
  type PlanningTravelOptions,
  type PlanningTravelResult,
} from './travel';
export {
  createSqlRouteCache,
  ROUTE_CACHE_TTL_DAYS,
  routeCacheKey,
  type CachedTravel,
  type RouteCache,
  type RouteCacheQuery,
} from './route-cache';
export {
  chooseLegMode,
  isWalkable,
  WALK_MAX_M,
  WALK_MAX_MINUTES,
  type ChosenLeg,
  type ChosenLegMode,
  type LegModeInput,
} from './travel-modes';
