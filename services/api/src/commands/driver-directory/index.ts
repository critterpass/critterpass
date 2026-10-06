/**
 * Drivers our crews used: the crew's commands (rate, invite, nudge, cancel, add a listed driver),
 * the member directory reads, the driver's public claim page routes and the moderation kinds.
 */
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../../app';
import type { ApiCommandDoors } from '../../feature-routes';
import { registerDriverDirectoryRoutes } from '../../routes/driver-directory';
import { registerPublicDriverClaimRoutes, type OtpSender } from '../../routes/public-driver-claims';
import {
  cancelDriverInviteCommand,
  createInviteDriverCommand,
  createNudgeDriverInviteCommand,
} from './invites';
import './moderation-kinds';
import { createRateDriverCommand } from './rate-driver';
import type { DriverDirectoryDeps } from './shared';
import { shortlistListedDriverCommand } from './shortlist';

export function registerDriverDirectory(
  app: OpenAPIHono<AppEnv>,
  doors: ApiCommandDoors,
  deps: DriverDirectoryDeps & { readonly otp: OtpSender | null },
): void {
  doors.registry.register(createRateDriverCommand(deps));
  doors.registry.register(createInviteDriverCommand(deps));
  doors.registry.register(createNudgeDriverInviteCommand(deps));
  doors.registry.register(cancelDriverInviteCommand);
  doors.registry.register(shortlistListedDriverCommand);
  registerDriverDirectoryRoutes(app, { pool: doors.pool, sessions: doors.sessions, deps });
  registerPublicDriverClaimRoutes(app, {
    pool: doors.pool,
    redis: doors.redis,
    logger: doors.logger,
    otp: deps.otp,
    deps,
  });
}
