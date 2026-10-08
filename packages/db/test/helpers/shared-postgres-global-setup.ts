/**
 * Vitest `globalSetup` entry: one Postgres for the whole run, on the repo's test image, with every
 * migration applied once to a template database that each test file clones (see ./shared-server).
 * Pair it with ./shared-server-worker-setup in `setupFiles`.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

import { buildPostgresImage, POSTGRES_TEST_IMAGE } from './containers';
import { migrateTestDatabase } from './migrate';
import { SHARED_TEMPLATE_DATABASE, withDatabase, type SharedPostgres } from './shared-server';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const IMAGE_CONFIG = '/etc/postgresql/postgresql.conf';

let container: StartedPostgreSqlContainer | undefined;

/**
 * The template starts from template1, not the image's own database: the container's health check
 * keeps opening sessions on that one, and Postgres refuses to copy a database with a session on
 * it. The image's init script runs here first, so the template holds what the image's database
 * holds (extensions, the empty powersync publication) before the migrations.
 */
async function createTemplate(adminUrl: string): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${SHARED_TEMPLATE_DATABASE}`);
    const pool = new pg.Pool({
      connectionString: withDatabase(adminUrl, SHARED_TEMPLATE_DATABASE),
      max: 1,
    });
    try {
      await pool.query(
        await readFile(path.join(repoRoot, 'infra/docker/postgres/init.sql'), 'utf8'),
      );
      await migrateTestDatabase(pool);
    } finally {
      await pool.end();
    }
    // No session can open on the template from here on (autovacuum included), so a clone never
    // finds it in use, however many workers clone at once.
    await admin.query(`ALTER DATABASE ${SHARED_TEMPLATE_DATABASE} ALLOW_CONNECTIONS false`);
  } finally {
    await admin.end();
  }
}

export async function setup(project: TestProject): Promise<void> {
  await buildPostgresImage();
  container = await new PostgreSqlContainer(POSTGRES_TEST_IMAGE)
    .withDatabase('critterpass')
    .withUsername('app_owner')
    .withPassword('app_owner')
    // The image's own command, plus room for every worker's pools on one server and no waiting
    // for a disk that is thrown away with the run.
    .withCommand([
      'postgres',
      '-c',
      `config_file=${IMAGE_CONFIG}`,
      '-c',
      'max_connections=500',
      '-c',
      'fsync=off',
    ])
    .withSharedMemorySize(512 * 1024 * 1024)
    .start();
  const adminUrl = withDatabase(container.getConnectionUri(), 'postgres');
  await createTemplate(adminUrl);
  const shared: SharedPostgres = { adminUrl, template: SHARED_TEMPLATE_DATABASE };
  project.provide('cpSharedPostgres', shared);
}

export async function teardown(): Promise<void> {
  await container?.stop();
  container = undefined;
}
