/**
 * Travel-data HTTP reads (docs/api-contracts.md §5.5): fares, the destination composite, weather,
 * marine, crowds and hazards. Every route needs a live session and answers from cached data only;
 * no request ever waits on a supplier.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import type { SessionResolver } from '../commands/_framework/session';
import { registerFaresRoute } from './fares-route';

export interface TravelDataRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
}

export function registerTravelDataRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: TravelDataRouteDeps,
): void {
  registerFaresRoute(app, deps);
}
