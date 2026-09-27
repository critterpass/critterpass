/**
 * Fresh Postgres for the console suite: a throwaway container from the Testcontainers image, then
 * `seed:local` (migrations, catalogue seed, one operator per role).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { E2E_DATABASE_URL, E2E_DB_CONTAINER, E2E_DB_PORT } from './e2e-env';

const repoRoot = path.resolve(import.meta.dirname, '../..');

function docker(args: readonly string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// eslint-disable-next-line no-restricted-syntax -- Playwright loads global setup/teardown by default export.
export default async function globalSetup(): Promise<void> {
  try {
    docker(['rm', '-f', E2E_DB_CONTAINER]);
  } catch {
    // No leftover container from an earlier run.
  }
  docker([
    'run',
    '-d',
    '--name',
    E2E_DB_CONTAINER,
    '-p',
    `${E2E_DB_PORT}:5432`,
    '-e',
    'POSTGRES_USER=app_owner',
    '-e',
    'POSTGRES_PASSWORD=app_owner',
    '-e',
    'POSTGRES_DB=critterpass',
    'critterpass-postgres:test',
  ]);
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      docker(['exec', E2E_DB_CONTAINER, 'pg_isready', '-U', 'app_owner', '-d', 'critterpass']);
      // The entrypoint restarts Postgres once after init scripts; give it a moment to settle.
      await sleep(1500);
      docker(['exec', E2E_DB_CONTAINER, 'pg_isready', '-U', 'app_owner', '-d', 'critterpass']);
      break;
    } catch {
      await sleep(1000);
    }
  }
  execFileSync('pnpm', ['--filter', '@cp/admin', 'seed:local'], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, ADMIN_DATABASE_URL: E2E_DATABASE_URL },
  });
}
