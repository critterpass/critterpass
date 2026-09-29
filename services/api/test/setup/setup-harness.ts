/**
 * The real stack for the setup suites: Testcontainers Postgres + Redis, Better Auth sessions, the
 * api app with the crew, poll and setup commands and the setup routes, a send-only pg-boss producer
 * for the jobs commands queue, and every log line the app writes captured (through the app's own
 * redaction) so a suite can prove what never reaches a log.
 */
import { Writable } from 'node:stream';

import { runMigrations, withSystem } from '@cp/db';
import { startPostgres, startRedis } from '@cp/db/testing';
import { generateUuidV7 } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { createClient, type RedisClientType } from 'redis';

import { createApp, type AppEnv } from '../../src/app';
import { createAuthModule } from '../../src/auth';
import type { CommandDoorDeps } from '../../src/commands/_framework/doors';
import {
  createCommandRegistry,
  type CommandRegistry,
} from '../../src/commands/_framework/registry';
import { betterAuthSessionResolver } from '../../src/commands/_framework/session';
import { registerCrewCommands } from '../../src/commands/crews';
import { registerSetupCommands } from '../../src/commands/setup';
import { startJobProducer } from '../../src/jobs/producer';
import { createLogger } from '../../src/obs/logger';
import { registerCmdResultsRoute } from '../../src/routes/cmd-results';
import { registerCommandRoute } from '../../src/routes/cmd';
import { registerSyncUploadRoute } from '../../src/routes/sync-upload';
import { disabledAttestationConfig } from '../auth/test-attestation-config';

export interface SignedIn {
  readonly cookie: string;
  readonly uid: string;
}

export interface SetupHarness {
  readonly pool: pg.Pool;
  readonly redis: RedisClientType;
  /** Every log line the app wrote, as written (after redaction). */
  readonly logs: string[];
  request(path: string, init?: RequestInit): Promise<Response>;
  signIn(): Promise<SignedIn>;
  run(
    session: SignedIn,
    cmd: string,
    payload: unknown,
    opts?: { deviceId?: string; opId?: string },
  ): Promise<{ status: number; body: Record<string, unknown> }>;
  stop(): Promise<void>;
}

export type MountSetup = (
  app: OpenAPIHono<AppEnv>,
  deps: CommandDoorDeps & { redis: RedisClientType },
) => void;

export async function startSetupHarness(
  extra?: (registry: CommandRegistry) => void,
  mount?: MountSetup,
): Promise<SetupHarness> {
  const [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  const pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  pool.on('error', () => undefined);
  await runMigrations(pool);
  const redis: RedisClientType = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();
  const logs: string[] = [];
  const logger = createLogger({
    level: 'debug',
    service: 'api',
    commit: 'test',
    destination: new Writable({
      write(chunk: Buffer, _encoding, done) {
        logs.push(chunk.toString('utf8'));
        done();
      },
    }),
  });
  const auth = createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: 'test-secret-at-least-32-characters-long',
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {},
    rateLimit: { customRules: { '/sign-in/*': { window: 1, max: 1000 } } },
    attestation: disabledAttestationConfig(),
  });
  const app = createApp({
    service: 'api',
    version: 'test',
    commit: 'test',
    logger,
    readiness: {},
    exposeDocs: false,
    pool,
  });
  const registry = createCommandRegistry();
  registerCrewCommands(registry);
  registerSetupCommands(registry);
  extra?.(registry);
  const deps: CommandDoorDeps = {
    pool,
    registry,
    sessions: betterAuthSessionResolver(auth.auth.api),
    redis,
    logger,
  };
  mount?.(app, { ...deps, redis });
  registerCommandRoute(app, deps);
  registerSyncUploadRoute(app, deps);
  registerCmdResultsRoute(app, deps);
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));
  const producer: PgBoss = await startJobProducer({
    connectionString: postgres.getConnectionUri(),
    logger: { error: () => undefined },
  });

  const request = (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    return Promise.resolve(app.request(`http://localhost:8787${path}`, { ...init, headers }));
  };
  return {
    pool,
    redis,
    logs,
    request,
    async signIn() {
      const response = await request('/api/auth/sign-in/anonymous', { method: 'POST', body: '{}' });
      const cookie = /better-auth\.session_token=[^;]+/.exec(
        response.headers.get('set-cookie') ?? '',
      )?.[0];
      const body = (await response.json()) as { user: { id: string } };
      if (!cookie) throw new Error('sign-in set no cookie');
      return { cookie, uid: body.user.id };
    },
    async run(session, cmd, payload, opts = {}) {
      const response = await request(`/v1/cmd/${cmd}`, {
        method: 'POST',
        headers: { cookie: session.cookie },
        body: JSON.stringify({
          op_id: opts.opId ?? generateUuidV7(),
          cmd,
          v: 1,
          actor: { uid: session.uid, via: 'app' },
          device: {
            id: opts.deviceId ?? 'device-1',
            platform: 'ios',
            app_version: '1.0.0',
            tz: 'Asia/Singapore',
          },
          client_ts: new Date().toISOString(),
          payload,
        }),
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    },
    async stop() {
      await producer.stop({ graceful: false });
      await auth.close();
      redis.destroy();
      await pool.end();
      await Promise.all([postgres.stop(), redisContainer.stop()]);
    },
  };
}

export interface SetupCrew {
  readonly crewId: string;
  readonly tripId: string;
  readonly organiser: SignedIn;
  readonly members: readonly SignedIn[];
}

/** A crew of `size` (the first organises) with a won trip to Kyoto in Asia/Tokyo. */
export async function buildSetupCrew(harness: SetupHarness, size: number): Promise<SetupCrew> {
  const members: SignedIn[] = [];
  for (let i = 0; i < size; i += 1) members.push(await harness.signIn());
  const organiser = members[0] as SignedIn;
  const crewId = generateUuidV7();
  const created = await harness.run(organiser, 'create_crew', {
    crew_id: crewId,
    name: 'Setup crew',
  });
  if (created.status !== 200) throw new Error(`create_crew: ${JSON.stringify(created.body)}`);
  const tripId = await withSystem(harness.pool, async (tx) => {
    for (const [i, member] of members.entries()) {
      await tx.query(
        "UPDATE users SET display_name = $2, home_airport = 'SIN', tz = 'Asia/Singapore' WHERE id = $1",
        [member.uid, `Member${i} Test`],
      );
      if (i > 0) {
        await tx.query(
          "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')",
          [crewId, member.uid],
        );
      }
    }
    const { rows: place } = await tx.query<{ id: string }>(
      `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
       VALUES ($1, 'Kyoto', 'Japan', 'live', 'USD', 'Asia/Tokyo') RETURNING id`,
      [`kyoto-${generateUuidV7().slice(-8)}`],
    );
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO trips (crew_id, status, destination_id, trip_length_days)
       VALUES ($1, 'voting', $2, 8) RETURNING id`,
      [crewId, place[0]?.id],
    );
    const id = rows[0]?.id as string;
    await tx.query("UPDATE trips SET status = 'won' WHERE id = $1", [id]);
    await tx.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')",
      [id, organiser.uid],
    );
    return id;
  });
  return { crewId, tripId, organiser, members };
}

export function resultOf<T>(response: { body: Record<string, unknown> }): T {
  return response.body['result'] as T;
}

export function errorOf(response: { body: Record<string, unknown> }): {
  code?: string;
  detail?: Record<string, unknown>;
} {
  const error = response.body['error'];
  return typeof error === 'object' && error !== null ? error : {};
}

/** Every text the server holds that a leak could hide in: outbox, events, results, job data. */
export async function capturedOutputs(pool: pg.Pool): Promise<string> {
  const { rows } = await pool.query<{ text: string }>(
    `SELECT string_agg(t, E'\\n') AS text FROM (
       SELECT payload::text AS t FROM rt_outbox
       UNION ALL SELECT payload::text FROM domain_events
       UNION ALL SELECT coalesce(result_ref::text, '') || coalesce(detail::text, '') FROM cmd_results
       UNION ALL SELECT coalesce(result::text, '') FROM cmd_log
       UNION ALL SELECT data::text FROM pgboss.job
     ) all_outputs`,
  );
  return rows[0]?.text ?? '';
}
