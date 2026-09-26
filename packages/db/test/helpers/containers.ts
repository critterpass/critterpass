import path from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { GenericContainer } from 'testcontainers';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

/** Tag of the image built from infra/docker/postgres (the same image docker compose runs). */
export const POSTGRES_TEST_IMAGE = 'critterpass-postgres:test';
export const REDIS_TEST_IMAGE = 'redis:8.8.3-alpine';

let imageBuild: Promise<void> | undefined;

/** Builds the compose Postgres image once per test process; Docker's layer cache makes rebuilds cheap. */
export function buildPostgresImage(): Promise<void> {
  imageBuild ??= GenericContainer.fromDockerfile(path.join(repoRoot, 'infra/docker/postgres'))
    .build(POSTGRES_TEST_IMAGE, { deleteOnExit: false })
    .then(() => undefined);
  return imageBuild;
}

/** Postgres 18 with pgvector, pg_trgm, unaccent, pgcrypto, logical replication and the powersync publication. */
export async function startPostgres(): Promise<StartedPostgreSqlContainer> {
  await buildPostgresImage();
  return new PostgreSqlContainer(POSTGRES_TEST_IMAGE)
    .withDatabase('critterpass')
    .withUsername('app_owner')
    .withPassword('app_owner')
    .start();
}

export function startRedis(): Promise<StartedRedisContainer> {
  return new RedisContainer(REDIS_TEST_IMAGE).start();
}

export type { StartedPostgreSqlContainer, StartedRedisContainer };
