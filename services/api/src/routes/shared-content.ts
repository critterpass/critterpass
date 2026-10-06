/**
 * Shared content read over HTTP (docs/api-contracts.md §5.5): the ideas board, a destination's
 * season and cost indices and a place's crowd curves. All are C0 rows any signed-in traveller may
 * read; each route reads as app_user, so RLS keeps unreviewed rows out exactly as the streams do.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import type { SessionResolver } from '../commands/_framework/session';
import { registerDestinationCostIndicesRoute } from './destination-cost-indices';
import { registerDestinationLinksRoute } from './destination-links';
import { registerDestinationSeasonRoute } from './destination-season';
import { registerHelpIdeasRoute } from './help-ideas';
import { registerPlaceCrowdForecastsRoute } from './place-crowd-forecasts';

export interface SharedContentDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
}

export function registerSharedContentRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: SharedContentDeps,
): void {
  registerHelpIdeasRoute(app, deps);
  registerDestinationSeasonRoute(app, deps);
  registerDestinationCostIndicesRoute(app, deps);
  registerDestinationLinksRoute(app, deps);
  registerPlaceCrowdForecastsRoute(app, deps);
}
