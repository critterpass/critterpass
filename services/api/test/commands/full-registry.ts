/**
 * The api's whole command registry, assembled the way `src/index.ts` boots it, without a server:
 * the pool and Redis client are never connected, because registering a command only stores its
 * definition.
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import pg from 'pg';
import { pino } from 'pino';
import { createClient } from 'redis';
import { vi } from 'vitest';

import type { AppEnv } from '../../src/app';
import type { AuthModule } from '../../src/auth';
import { buildFieldEncryptionKeyringFromEnv } from '../../src/auth/bootstrap';
import { createClaimAttributionCommand } from '../../src/commands/attribution/claim-attribution';
import { createAppCommandRegistry } from '../../src/commands/catalogue';
import { registerInvites } from '../../src/commands/invites';
import { registerNudgeCommands } from '../../src/commands/nudges';
import type { CommandRegistry } from '../../src/commands/_framework/registry';
import { loadApiEnv } from '../../src/env';
import { registerFeatureRoutes } from '../../src/feature-routes';
import { createLinkProviderRegistry } from '../../src/links/registry';

/** Every optional integration switched on, so a command behind a configuration check registers. */
const FULL_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  APP_ENV: 'staging',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://app:app@127.0.0.1:1/app',
  REDIS_URL: 'redis://127.0.0.1:1',
  PUBLIC_BASE_URL: 'https://api.example.test',
  AUTH_DATABASE_URL: 'postgres://auth:auth@127.0.0.1:1/app',
  BETTER_AUTH_SECRET: 'not-a-secret-registry-test-value-0123456789',
  FIELD_ENCRYPTION_KEYS: `k1:${Buffer.alloc(32, 7).toString('base64')}`,
  FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'k1',
};

export function buildFullCommandRegistry(): CommandRegistry {
  // The bookings module reads these two straight from the process environment.
  vi.stubEnv('INBOUND_EMAIL_HMAC_SECRET', 'not-a-secret-inbound-hmac-0123456789abcdef');
  vi.stubEnv('INBOUND_SENDER_PEPPER', 'not-a-secret-sender-pepper');
  const env = loadApiEnv(FULL_ENV);
  const logger = pino({ level: 'silent' });
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const redis = createClient({ url: env.REDIS_URL });
  const keyring = buildFieldEncryptionKeyringFromEnv(env);
  const commands = createAppCommandRegistry();
  const links = createLinkProviderRegistry();
  registerInvites(commands, links, env, 'staging', keyring);
  registerNudgeCommands(commands, { linkEnv: 'staging' });
  commands.register(
    createClaimAttributionCommand({ registry: links, config: { env: 'staging', seatKeys: {} } }),
  );
  registerFeatureRoutes(new OpenAPIHono<AppEnv>(), {
    env,
    doors: { pool, registry: commands, sessions: () => Promise.resolve(null), redis, logger },
    auth: {} as AuthModule['auth'],
    keyring,
    links,
    analytics: { capture: () => undefined } as never,
  });
  vi.unstubAllEnvs();
  return commands;
}
