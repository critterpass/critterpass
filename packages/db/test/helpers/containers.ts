import path from 'node:path';

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { GenericContainer } from 'testcontainers';

import {
  cloneSharedDatabase,
  leaseSharedRedis,
  sharedPostgres,
  sharedRedis,
} from './shared-server';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

/** Tag of the image built from infra/docker/postgres (the same image docker compose runs). */
export const POSTGRES_TEST_IMAGE = 'critterpass-postgres:test';
export const REDIS_TEST_IMAGE = 'redis:8.8.3-alpine';

export interface StartOptions {
  /**
   * Start a container of the caller's own even when the run shares a server. For suites that stop
   * the server, reach into its container, or need a database no migration has touched.
   */
  readonly ownContainer?: boolean;
}

let imageBuild: Promise<void> | undefined;

/** Builds the compose Postgres image once per test process; Docker's layer cache makes rebuilds cheap. */
export function buildPostgresImage(): Promise<void> {
  imageBuild ??= GenericContainer.fromDockerfile(path.join(repoRoot, 'infra/docker/postgres'))
    .build(POSTGRES_TEST_IMAGE, { deleteOnExit: false })
    .then(() => undefined);
  return imageBuild;
}

/**
 * A share of the run's server, shaped like the container a suite would otherwise start. It answers
 * what suites ask of a container (where to connect, `stop()`); any other container method fails
 * with the way to get a real one instead of "is not a function".
 */
function sharedServerHandle<T extends object>(
  container: { readonly prototype: T },
  answers: { readonly [K in keyof T]?: unknown },
): T {
  return new Proxy(answers, {
    get(target, property, receiver) {
      const missing = !Reflect.has(target, property) && property !== 'constructor';
      if (missing && Reflect.has(container.prototype, property)) {
        throw new Error(
          `${String(property)}() needs a container of this file's own: start it with { ownContainer: true }`,
        );
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
  }) as T;
}

/**
 * Postgres 18 with pgvector, pg_trgm, unaccent, pgcrypto, logical replication and the powersync
 * publication. In a run with a shared server (./shared-postgres-global-setup) this is a database
 * cloned from the migrated template, so the caller's `runMigrations` finds nothing left to apply;
 * otherwise, or with `ownContainer`, a new container whose database has no migrations yet.
 */
export async function startPostgres(
  options: StartOptions = {},
): Promise<StartedPostgreSqlContainer> {
  const shared = options.ownContainer === true ? undefined : sharedPostgres();
  if (shared !== undefined) {
    const clone = await cloneSharedDatabase(shared);
    const url = new URL(clone.url);
    return sharedServerHandle(StartedPostgreSqlContainer, {
      getConnectionUri: () => clone.url,
      getHost: () => url.hostname,
      getPort: () => Number(url.port),
      getDatabase: () => clone.name,
      getUsername: () => decodeURIComponent(url.username),
      getPassword: () => decodeURIComponent(url.password),
      stop: () => clone.drop(),
    });
  }
  await buildPostgresImage();
  return new PostgreSqlContainer(POSTGRES_TEST_IMAGE)
    .withDatabase('critterpass')
    .withUsername('app_owner')
    .withPassword('app_owner')
    .start();
}

/**
 * An empty Redis server: one of the run's shared container when one is free
 * (./shared-redis-global-setup), otherwise, or with `ownContainer`, a new container.
 */
export async function startRedis(options: StartOptions = {}): Promise<StartedRedisContainer> {
  const postgres = options.ownContainer === true ? undefined : sharedPostgres();
  const redis = sharedRedis();
  if (postgres !== undefined && redis !== undefined) {
    const lease = await leaseSharedRedis(postgres, redis);
    if (lease !== undefined) {
      return sharedServerHandle(StartedRedisContainer, {
        getConnectionUrl: () => lease.url,
        stop: () => lease.release(),
      });
    }
  }
  return new RedisContainer(REDIS_TEST_IMAGE).start();
}

export type { StartedPostgreSqlContainer, StartedRedisContainer };
