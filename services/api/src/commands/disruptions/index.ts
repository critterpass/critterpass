/** Disruption commands and routes, registered at boot (one line in feature-routes.ts). */
import { onEventAppended } from '@cp/db';
import type { RouteEtaProvider } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { RateLimitRedisClient } from '../../abuse/rate-limits';
import type { AppEnv } from '../../app';
import { registerJourneyRoutes } from '../../routes/journey';
import { createMapboxRoutingProvider, straightLineRoutingProvider } from '../../routing/eta';
import { MapboxRoutingClient } from '../../routing/mapbox';
import { createAuditedSupplierHttp } from '../../suppliers/http';
import type { SupplierEnv } from '../../suppliers/link-config';
import { viatorPortFromEnv } from '../../suppliers/order-port';
import type { CommandRegistry } from '../_framework/registry';
import type { SessionResolver } from '../_framework/session';
import type { OrderCommandDeps } from '../suppliers/hold-activity';
import { announceDisruptionCommand } from './announce-disruption';
import { chooseLateOptionCommand } from './choose-late-option';
import { decideDisruptionActionCommand } from './decide-disruption-action';
import { dismissWeatherSuggestionCommand } from './dismiss-weather-suggestion';
import { disruptionReactHook, lateReportHook } from './hooks';
import { createHoldStormSeatsCommand, stormBookedHook } from './storm-seats';
import { undoDisruptionActionCommand } from './undo-disruption-action';

export function registerDisruptionCommands(
  registry: CommandRegistry,
  orders: OrderCommandDeps = {},
): void {
  registry.register(decideDisruptionActionCommand);
  registry.register(undoDisruptionActionCommand);
  registry.register(announceDisruptionCommand);
  registry.register(dismissWeatherSuggestionCommand);
  registry.register(chooseLateOptionCommand);
  registry.register(createHoldStormSeatsCommand(orders));
  onEventAppended(stormBookedHook(orders));
}

export interface DisruptionDoors {
  readonly pool: pg.Pool;
  readonly registry: CommandRegistry;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  readonly logger: { warn(obj: unknown, message: string): void };
}

/** The journey check routes on Mapbox traffic when a token is set, else on the flagged estimate. */
function journeyRouting(env: SupplierEnv, doors: DisruptionDoors): RouteEtaProvider {
  const token = env['MAPBOX_TOKEN'];
  if (token === undefined || token === '') return straightLineRoutingProvider;
  return createMapboxRoutingProvider({
    client: new MapboxRoutingClient({ accessToken: token }),
    onProviderError: (error) => doors.logger.warn({ err: error }, 'journey routing unavailable'),
  });
}

export function registerDisruptions(
  app: OpenAPIHono<AppEnv>,
  doors: DisruptionDoors,
  env: SupplierEnv = process.env,
): void {
  const http = createAuditedSupplierHttp(doors.pool, (error) =>
    doors.logger.warn({ err: error }, 'supplier call audit write failed'),
  );
  registerDisruptionCommands(doors.registry, { port: viatorPortFromEnv(env, http) });
  registerJourneyRoutes(app, { ...doors, routing: journeyRouting(env, doors) });
  onEventAppended(disruptionReactHook);
  onEventAppended(lateReportHook);
}
