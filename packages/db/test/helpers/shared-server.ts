/**
 * Worker side of the run's shared test servers. A suite whose Vitest config lists the global
 * set-ups next to this file gets one Postgres (and one Redis container) for the whole run instead
 * of one per test file: each file clones the migrated template database, which takes a fraction of
 * the time of starting a container and applying every migration.
 *
 * The details travel from the global set-up to each worker as provided values, which the worker
 * set-up file copies into the environment. Nothing here imports Vitest, so the helpers behave the
 * same in scripts and in Jest: with no shared server announced they start their own containers.
 */
import { randomBytes, randomInt } from 'node:crypto';
import net from 'node:net';

import pg from 'pg';

export const SHARED_POSTGRES_ENV = 'CP_TEST_SHARED_POSTGRES';
export const SHARED_REDIS_ENV = 'CP_TEST_SHARED_REDIS';

/** Migrated once by the global set-up and closed to connections, so it can always be cloned. */
export const SHARED_TEMPLATE_DATABASE = 'cp_shared_template';

export interface SharedPostgres {
  /** Superuser URL of the server's maintenance database (never the template). */
  readonly adminUrl: string;
  readonly template: string;
}

export interface SharedRedis {
  /** One URL per Redis server process in the shared container. */
  readonly urls: readonly string[];
}

function fromEnv<T>(name: string): T | undefined {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? undefined : (JSON.parse(raw) as T);
}

export function sharedPostgres(): SharedPostgres | undefined {
  return fromEnv<SharedPostgres>(SHARED_POSTGRES_ENV);
}

export function sharedRedis(): SharedRedis | undefined {
  return fromEnv<SharedRedis>(SHARED_REDIS_ENV);
}

export function withDatabase(connectionUri: string, database: string): string {
  const url = new URL(connectionUri);
  url.pathname = `/${database}`;
  return url.toString();
}

/** Unique across the workers of a run and across runs that reuse a process id. */
export function uniqueDatabaseName(): string {
  return `cp_test_${process.pid}_${randomBytes(6).toString('hex')}`;
}

async function connectAdmin(adminUrl: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: adminUrl });
  client.on('error', () => undefined);
  await client.connect();
  return client;
}

async function asAdmin(adminUrl: string, statement: string): Promise<void> {
  const client = await connectAdmin(adminUrl);
  try {
    await client.query(statement);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export interface ClonedDatabase {
  readonly name: string;
  readonly url: string;
  drop(): Promise<void>;
}

/** A database of the caller's own on the shared server, cloned from the migrated template. */
export async function cloneSharedDatabase(shared: SharedPostgres): Promise<ClonedDatabase> {
  const name = uniqueDatabaseName();
  await asAdmin(shared.adminUrl, `CREATE DATABASE ${name} TEMPLATE ${shared.template}`);
  return {
    name,
    url: withDatabase(shared.adminUrl, name),
    async drop() {
      // Best effort, like stopping a container: the server itself goes away with the run, and a
      // database Postgres refuses to drop (a replication slot still active) must not fail a file
      // whose tests passed.
      await asAdmin(shared.adminUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(
        () => undefined,
      );
    },
  };
}

/** First key of the advisory locks that mark a shared Redis server as taken. */
const REDIS_LEASE_LOCK_SPACE = 726_334;

function flushRedis(url: string): Promise<void> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: hostname, port: Number(port) });
    socket.setTimeout(5000, () => socket.destroy(new Error(`${url} did not answer FLUSHALL`)));
    socket.once('error', reject);
    socket.once('connect', () => socket.write('FLUSHALL\r\n'));
    socket.once('data', (reply) => {
      socket.end();
      if (reply.toString().startsWith('+OK')) resolve();
      else reject(new Error(`${url} answered FLUSHALL with ${reply.toString().trim()}`));
    });
  });
}

export interface RedisLease {
  readonly url: string;
  release(): Promise<void>;
}

/**
 * Takes one of the shared container's Redis servers for the caller alone, empty, until `release`.
 * Whole servers, not numbered databases: FLUSHALL, pub/sub and CLIENT commands reach every
 * database of a server, and suites use them. The claim is a session advisory lock on the shared
 * Postgres, so a worker that dies gives its server back without any clean-up. Returns `undefined`
 * when every server is taken.
 */
export async function leaseSharedRedis(
  postgres: SharedPostgres,
  redis: SharedRedis,
): Promise<RedisLease | undefined> {
  const claim = await connectAdmin(postgres.adminUrl);
  const first = randomInt(redis.urls.length);
  for (let step = 0; step < redis.urls.length; step += 1) {
    const index = (first + step) % redis.urls.length;
    const url = redis.urls[index];
    if (url === undefined) continue;
    const { rows } = await claim.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1, $2) AS locked',
      [REDIS_LEASE_LOCK_SPACE, index],
    );
    if (rows[0]?.locked !== true) continue;
    try {
      await flushRedis(url);
    } catch (error) {
      await claim.end().catch(() => undefined);
      throw error;
    }
    return {
      url,
      async release() {
        await flushRedis(url).catch(() => undefined);
        await claim.end().catch(() => undefined);
      },
    };
  }
  await claim.end().catch(() => undefined);
  return undefined;
}
