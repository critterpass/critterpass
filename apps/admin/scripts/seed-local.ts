/**
 * `pnpm --filter @cp/admin seed:local`: prepares a local database for the console (dev server,
 * Playwright): creates it if missing, applies every migration, runs the shared catalogue seed, and
 * upserts one operator per role (`<role>@critterpass.test`, signed in through the local dev door).
 * Local infra only (`pnpm infra:up`); never point it at a shared environment.
 */
import { execFileSync } from 'node:child_process';

import pg from 'pg';

const DEFAULT_URL = 'postgres://app_owner:app_owner@localhost:54320/critterpass_admin';

export const LOCAL_OPERATORS = [
  { email: 'owner@critterpass.test', name: 'Olive Owner', role: 'owner' },
  { email: 'ops@critterpass.test', name: 'Oscar Ops', role: 'ops' },
  { email: 'content@critterpass.test', name: 'Cora Content', role: 'content' },
  { email: 'support@critterpass.test', name: 'Sami Support', role: 'support' },
] as const;

function assertLocal(url: URL): void {
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`seed:local only runs against local Postgres, not ${url.hostname}`);
  }
}

async function ensureDatabase(url: URL): Promise<void> {
  const name = url.pathname.slice(1);
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`unexpected database name ${name}`);
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  const client = new pg.Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount === 0) await client.query(`CREATE DATABASE ${name}`);
  } finally {
    await client.end();
  }
}

function runDbScript(script: 'migrate' | 'seed', databaseUrl: string): void {
  execFileSync('pnpm', ['--filter', '@cp/db', script], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, DATABASE_URL: databaseUrl, DATABASE_DIRECT_URL: databaseUrl },
  });
}

async function upsertOperators(databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const operator of LOCAL_OPERATORS) {
      await client.query(
        `INSERT INTO auth."user" (id, name, email, email_verified, role)
         VALUES (uuidv7(), $1, $2, true, $3)
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, banned = false`,
        [operator.name, operator.email, operator.role],
      );
    }
  } finally {
    await client.end();
  }
}

export async function seedLocal(databaseUrl: string = DEFAULT_URL): Promise<void> {
  const url = new URL(databaseUrl);
  assertLocal(url);
  await ensureDatabase(url);
  runDbScript('migrate', databaseUrl);
  runDbScript('seed', databaseUrl);
  await upsertOperators(databaseUrl);
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const target = process.env['ADMIN_DATABASE_URL'] ?? DEFAULT_URL;
  seedLocal(target)
    .then(() => console.log(`seeded ${new URL(target).pathname.slice(1)} for the ops console`))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
