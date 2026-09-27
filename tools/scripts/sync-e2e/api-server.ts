/**
 * The api process of the end-to-end sync stack: the real Hono app, Better Auth (anonymous sign-in,
 * `/api/auth/token?aud=`, JWKS), the three command doors, and the Centrifugo subscribe/publish
 * proxies, wired as services/api/src/index.ts wires them, over the e2e command registry
 * (./commands.ts). Configuration comes from the environment run.ts passes; prints
 * `{"port": n}` once listening.
 */
import { createRequire } from 'node:module';

import pg from 'pg';
import { createClient } from 'redis';

import { createApp } from '../../../services/api/src/app';
import { createAuthModule } from '../../../services/api/src/auth';
import { mountAuthHandler } from '../../../services/api/src/auth/mount';
import { createCommandRegistry } from '../../../services/api/src/commands/_framework/registry';
import { betterAuthSessionResolver } from '../../../services/api/src/commands/_framework/session';
import { registerCmdResultsRoute } from '../../../services/api/src/routes/cmd-results';
import { registerCommandRoute } from '../../../services/api/src/routes/cmd';
import { registerInternalRtRoutes } from '../../../services/api/src/routes/internal-rt';
import { registerSyncUploadRoute } from '../../../services/api/src/routes/sync-upload';
import { registerE2eCommands } from './commands';

type Logger = Parameters<typeof createApp>[0]['logger'];

interface NodeServer {
  close(callback: () => void): void;
}
type Serve = (
  options: {
    fetch: (request: Request) => Response | Promise<Response>;
    port: number;
    hostname: string;
  },
  onListening: (info: { port: number }) => void,
) => NodeServer;

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

// The api's own logger and HTTP server packages, resolved from the api (this workspace does not
// depend on them).
const requireFromApi = createRequire(
  new URL('../../../services/api/package.json', import.meta.url),
);
const { pino } = requireFromApi('pino') as { pino: (options: object) => Logger };
const { serve } = requireFromApi('@hono/node-server') as { serve: Serve };

const databaseUrl = required('DATABASE_URL');
const port = Number(required('PORT'));
const logger = pino({ level: process.env['LOG_LEVEL'] ?? 'warn', base: { service: 'api' } });

const pool = new pg.Pool({ connectionString: databaseUrl, max: 20 });
pool.on('error', (error) => logger.error({ err: error }, 'idle database client error'));
const redis = createClient({ url: required('REDIS_URL') });
redis.on('error', (error: unknown) => logger.warn({ err: error }, 'redis connection error'));
await redis.connect();

const app = createApp({
  service: 'api',
  version: 'e2e',
  commit: 'e2e',
  logger,
  exposeDocs: false,
  pool,
  readiness: {
    db: async () => {
      await pool.query('select 1');
    },
  },
});

const authModule = createAuthModule({
  appPool: pool,
  authDatabaseUrl: databaseUrl,
  redis,
  secret: required('BETTER_AUTH_SECRET'),
  baseUrl: `http://127.0.0.1:${port}/api/auth`,
  trustedOrigins: ['app.critterpass://'],
  otpAdapters: {},
  // Every harness client signs in anonymously from one address.
  rateLimit: { customRules: { '/sign-in/*': { window: 1, max: 1000 } } },
  attestation: {
    iosMode: 'log',
    androidMode: 'log',
    appAttest: {
      teamId: 'E2ETEAMID00',
      bundleId: 'app.critterpass.e2e',
      rootCertificatePem: 'unused: harness clients send no attestation header',
      allowDevelopmentEnvironment: true,
    },
    android: undefined,
  },
  isProduction: false,
});

const registry = createCommandRegistry();
registerE2eCommands(registry);
const doors = {
  pool,
  registry,
  sessions: betterAuthSessionResolver(authModule.auth.api),
  redis,
  logger,
};
registerCommandRoute(app, doors);
registerSyncUploadRoute(app, doors);
registerCmdResultsRoute(app, doors);
registerInternalRtRoutes(app, { pool, redis, proxySecret: required('RT_PROXY_SECRET') });
// The api's own auth mount, so the harness exercises the token, JWKS and revocation wiring it ships.
mountAuthHandler(app, authModule, { pool, logger });

// All interfaces: Centrifugo and PowerSync reach this through host.docker.internal.
const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  process.stdout.write(`${JSON.stringify({ port: info.port })}\n`);
});

function shutdown() {
  server.close(() => {
    void Promise.allSettled([pool.end(), redis.close(), authModule.close()]).then(() =>
      process.exit(0),
    );
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
