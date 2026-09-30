/**
 * Everything the supplier layer mounts on the api, in one call from `registerFeatureRoutes`: the
 * supplier commands (with the audited supplier HTTP client and the link programmes this deployment
 * is configured for) and the attribution bridge.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { registerSupplierCommands } from '../commands/suppliers';
import type { CommandRegistry } from '../commands/_framework/registry';
import { registerSupplierBridgeRoute } from './bridge-route';
import { createAuditedSupplierHttp } from './http';
import { affiliateLinkConfigFromEnv, type SupplierEnv } from './link-config';

export interface SupplierDoors {
  readonly pool: pg.Pool;
  readonly registry: CommandRegistry;
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
  registerSupplierCommands(doors.registry, { http, links: affiliateLinkConfigFromEnv(env) });
  registerSupplierBridgeRoute(app, doors.pool);
}
