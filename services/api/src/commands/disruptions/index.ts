/** Disruption commands and routes, registered at boot (one line in feature-routes.ts). */
import { onEventAppended } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../../app';
import { createAuditedSupplierHttp } from '../../suppliers/http';
import type { SupplierEnv } from '../../suppliers/link-config';
import { viatorPortFromEnv } from '../../suppliers/order-port';
import type { CommandRegistry } from '../_framework/registry';
import type { OrderCommandDeps } from '../suppliers/hold-activity';
import { announceDisruptionCommand } from './announce-disruption';
import { decideDisruptionActionCommand } from './decide-disruption-action';
import { dismissWeatherSuggestionCommand } from './dismiss-weather-suggestion';
import { disruptionReactHook } from './hooks';
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
  registry.register(createHoldStormSeatsCommand(orders));
  onEventAppended(stormBookedHook(orders));
}

export interface DisruptionDoors {
  readonly pool: pg.Pool;
  readonly registry: CommandRegistry;
  readonly logger: { warn(obj: unknown, message: string): void };
}

export function registerDisruptions(
  _app: OpenAPIHono<AppEnv>,
  doors: DisruptionDoors,
  env: SupplierEnv = process.env,
): void {
  const http = createAuditedSupplierHttp(doors.pool, (error) =>
    doors.logger.warn({ err: error }, 'supplier call audit write failed'),
  );
  registerDisruptionCommands(doors.registry, { port: viatorPortFromEnv(env, http) });
  onEventAppended(disruptionReactHook);
}
