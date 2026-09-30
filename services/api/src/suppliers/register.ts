/**
 * Everything the supplier layer mounts on the api, in one call from `registerFeatureRoutes`: the
 * supplier commands (with the audited supplier HTTP client, the link programmes this deployment is
 * configured for and the Viator port where a key exists), the attribution bridge, the order reads,
 * the settle door for the worker's status poll, and the supplier answers to the plan's hold-expiry
 * and booking-impact seams. Every Viator path also waits on the `viator_booking` partner switch.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { registerSupplierCommands } from '../commands/suppliers';
import type { CommandRegistry } from '../commands/_framework/registry';
import type { SessionResolver } from '../commands/_framework/session';
import { registerSupplierBridgeRoute } from './bridge-route';
import { registerCancelQuoteRoute } from './cancel-quote';
import { createAuditedSupplierHttp } from './http';
import { affiliateLinkConfigFromEnv, type SupplierEnv } from './link-config';
import { viatorPortFromEnv } from './order-port';
import { registerOrderRoutes } from './order-routes';
import { registerSupplierPlanProviders } from './plan-providers';
import { registerSettleDoor } from './settle-door';

export interface SupplierDoors {
  readonly pool: pg.Pool;
  readonly registry: CommandRegistry;
  readonly sessions: SessionResolver;
  readonly logger: { warn(obj: unknown, message: string): void };
}

export function registerSupplierRoutes(
  app: OpenAPIHono<AppEnv>,
  doors: SupplierDoors,
  env: SupplierEnv = process.env,
): void {
  const http = createAuditedSupplierHttp(doors.pool, (error) =>
    doors.logger.warn({ err: error }, 'supplier call audit write failed'),
  );
  const port = viatorPortFromEnv(env, http);
  registerSupplierCommands(doors.registry, { http, links: affiliateLinkConfigFromEnv(env), port });
  registerSupplierBridgeRoute(app, doors.pool);
  registerOrderRoutes(app, { ...doors, port });
  registerCancelQuoteRoute(app, { ...doors, port });
  const secret = env['SUPPLIERS_INTERNAL_SECRET'];
  if (port !== undefined && secret) registerSettleDoor(app, { pool: doors.pool, port, secret });
  registerSupplierPlanProviders();
}
