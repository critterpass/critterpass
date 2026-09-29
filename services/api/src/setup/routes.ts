/**
 * Mounts the trip setup reads and the calendar OAuth routes, and registers the calendar commands
 * with their runtime dependencies (the OAuth config from env, Redis for the session-bound state,
 * and the `calendar.oauth_<provider>` flags evaluated per user).
 */
import { userPid } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../app';
import { calendarOAuthConfigFromEnv, flagGate } from '../calendar-oauth/config';
import { registerCalendarOAuthRoutes } from '../calendar-oauth/routes';
import type { OAuthStateStore } from '../calendar-oauth/state';
import { registerCalendarCommands } from '../commands/setup';
import type { CommandRegistry } from '../commands/_framework/registry';
import type { SessionResolver } from '../commands/_framework/session';
import { createFlagService } from '../obs/flags';
import { registerWindowsRoute } from './windows-route';

export interface SetupRouteDeps {
  readonly pool: pg.Pool;
  readonly registry: CommandRegistry;
  readonly sessions: SessionResolver;
  readonly store: OAuthStateStore;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export function registerSetupRoutes(app: OpenAPIHono<AppEnv>, deps: SetupRouteDeps): void {
  const config = calendarOAuthConfigFromEnv(deps.env);
  const flags = createFlagService({
    projectApiKey: deps.env['POSTHOG_PROJECT_API_KEY'],
    flagsSecretKey: deps.env['POSTHOG_PROJECT_SECRET_KEY'],
    host: deps.env['POSTHOG_HOST'],
  });
  const salt = deps.env['ANALYTICS_PID_SALT'];
  const gate = flagGate(async (uid) =>
    salt === undefined || salt.length < 16
      ? {}
      : flags.evaluate({ distinctId: await userPid(uid, salt) }),
  );
  registerCalendarCommands(deps.registry, { config, store: deps.store, gate });
  registerCalendarOAuthRoutes(app, { sessions: deps.sessions, store: deps.store, config, gate });
  registerWindowsRoute(app, deps);
}
