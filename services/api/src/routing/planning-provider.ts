/**
 * The planning routing provider: walk and drive minutes that fit, the plan check, the guide's
 * `route_eta` and the stored legs may keep. Valhalla first (cached in `route_cache`), straight-line
 * "about" minutes when it can't answer. It never calls Mapbox: Navigation API results may not be
 * stored (routing/README.md, §2.10.1), and the result type has no Mapbox source to return.
 * Live, human-facing ETAs (`/v1/routes/*`, place detail) keep the Mapbox provider in `eta.ts`.
 */
import { createPlanningTravel, type PlanningTravel } from '@cp/suppliers';
import type pg from 'pg';

import { poolRouteCache } from './route-cache';
import { apiValhalla } from './valhalla';

export type { PlanningTravel, PlanningTravelMode, PlanningTravelResult } from '@cp/suppliers';

export interface PlanningProviderOptions {
  /** `VALHALLA_URL`; unset = straight-line estimates only. */
  readonly valhallaUrl?: string | undefined;
  /** Enables the `route_cache` read-through. */
  readonly pool?: pg.Pool;
  readonly onError?: (error: unknown) => void;
}

export function createPlanningProvider(options: PlanningProviderOptions): PlanningTravel {
  return createPlanningTravel({
    valhalla: apiValhalla(options.valhallaUrl),
    ...(options.pool === undefined ? {} : { cache: poolRouteCache(options.pool) }),
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  });
}
