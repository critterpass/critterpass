/**
 * The api's AI routes (docs/api-contracts.md §5.3) mounted in one place at boot: the AI job poll
 * and the guide's invite lines.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import type { ApiEnv } from '../env';
import { registerInviteLineRoutesFromEnv, type InviteLineDeps } from './invite-lines';
import { registerJobsRoute } from './jobs-route';

export function registerAiRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: Omit<InviteLineDeps, 'gateway' | 'compliance'>,
  env: ApiEnv,
  logger: { warn(details: object, message: string): void },
): void {
  registerJobsRoute(app, deps);
  registerInviteLineRoutesFromEnv(app, deps, env, logger);
}
