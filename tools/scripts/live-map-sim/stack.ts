/**
 * A self-contained crew live map stack for `sim.ts --check`: Postgres and Redis in Testcontainers
 * (the repo's image, migrated with the repo's runner), the real api app in process (Better Auth
 * anonymous sign-in, the command door with the full command catalogue, `POST /v1/loc` and the live
 * snapshot) and the real worker jobs (`sched.enqueue_due` cron, `eta.meetups`, `location.expire`)
 * on pg-boss. There is no Centrifugo: realtime hints are asserted as queued `rt_outbox` rows, which
 * the relay's own suites prove are delivered.
 */
import { createRequire } from 'node:module';

import { runMigrations } from '@cp/db';
import { startPostgres, startRedis } from '@cp/db/testing';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';

import { createApp } from '../../../services/api/src/app';
import { createAuthModule } from '../../../services/api/src/auth';
import { createAppCommandRegistry } from '../../../services/api/src/commands/catalogue';
import { betterAuthSessionResolver } from '../../../services/api/src/commands/_framework/session';
import { registerCommandRoute } from '../../../services/api/src/routes/cmd';
import { registerLiveMapRoutes } from '../../../services/api/src/routes/live-map';
import { registerLocationRoute } from '../../../services/api/src/routes/loc';
import {
  createBoss,
  createFailureReporter,
  startJobRuntime,
  stopJobRuntime,
} from '../../../services/worker/src/boss';
import { liveMapJobs } from '../../../services/worker/src/jobs/live-map';
import { enqueueDueJob } from '../../../services/worker/src/jobs/sched/enqueue-due';

type Logger = Parameters<typeof createApp>[0]['logger'];

// The api's own logger package, resolved from the api (this workspace does not depend on it).
const requireFromApi = createRequire(
  new URL('../../../services/api/package.json', import.meta.url),
);
const { pino } = requireFromApi('pino') as { pino: (options: object) => Logger };

export type Http = (path: string, init?: RequestInit) => Promise<Response>;

export interface SimStack {
  readonly http: Http;
  /** Owner-role pool: seeds the scenario and reads server state for assertions. */
  readonly pool: pg.Pool;
  stop(): Promise<void>;
}

const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };

export async function startSimStack(log: (line: string) => void): Promise<SimStack> {
  const [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  const pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  pool.on('error', () => undefined);
  const migrated = await runMigrations(pool);
  log(`stack: ${migrated.applied.length} migrations applied`);
  const redis: RedisClientType = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();

  const auth = createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: 'live-map-sim-secret-at-least-32-characters',
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {},
    rateLimit: { customRules: { '/sign-in/*': { window: 1, max: 1000 } } },
    attestation: {
      iosMode: 'log',
      androidMode: 'log',
      appAttest: {
        teamId: 'UNUSEDTEAMID',
        bundleId: 'app.critterpass.sim',
        rootCertificatePem: 'unused: the sim never sends an attestation header',
        allowDevelopmentEnvironment: true,
      },
      android: undefined,
    },
  });
  const logger = pino({ level: 'silent' });
  const app = createApp({
    service: 'api',
    version: 'sim',
    commit: 'sim',
    logger,
    readiness: {},
    exposeDocs: false,
    pool,
  });
  const doors = {
    pool,
    registry: createAppCommandRegistry(),
    sessions: betterAuthSessionResolver(auth.auth.api),
    redis,
    logger,
  };
  registerCommandRoute(app, doors);
  registerLocationRoute(app, { pool, sessions: doors.sessions, redis });
  registerLiveMapRoutes(app, doors);
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
  log('stack: api ready (in process)');

  const boss = createBoss({ connectionString: postgres.getConnectionUri(), logger: quiet });
  await startJobRuntime({
    boss,
    deps: { pool, logger: quiet },
    jobs: [enqueueDueJob(), ...liveMapJobs({})],
    report: createFailureReporter(quiet, () => undefined),
    crons: true,
  });
  log('stack: worker jobs ready (sched.enqueue_due, eta.meetups, location.expire)');

  const http: Http = (path, init = {}) => {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    return Promise.resolve(app.request(`http://localhost:8787${path}`, { ...init, headers }));
  };

  return {
    http,
    pool,
    async stop() {
      await stopJobRuntime(boss, 5000).catch(() => undefined);
      await auth.close();
      redis.destroy();
      await pool.end();
      await Promise.all([postgres.stop(), redisContainer.stop()]);
    },
  };
}
