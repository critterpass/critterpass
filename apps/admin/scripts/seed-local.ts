/**
 * `pnpm --filter @cp/admin seed:local`: prepares a local database for the console (dev server,
 * Playwright): creates it if missing, applies every migration, runs the shared catalogue seed, and
 * upserts one operator per role (`<role>@critterpass.test`, signed in through the local dev door)
 * plus a few Bali POIs and the travellers and queue items of the work areas.
 * Local infra only (`pnpm infra:up`); never point it at a shared environment.
 */
import { execFileSync } from 'node:child_process';

import pg from 'pg';

import { seedAccountAndCommunity } from './seed-account-and-community';
import { seedSeasonReview } from './seed-season-review';
import { seedWorkQueues } from './seed-work-queues';

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

/** A few Bali places so the POI editor and its map preview have something to show. */
const LOCAL_POIS = [
  { name: 'Tegallalang Rice Terrace', category: 'nature', lat: -8.4312, lng: 115.2793 },
  { name: 'Pura Tirta Empul', category: 'temple_shrine', lat: -8.4153, lng: 115.3154 },
  { name: 'Ubud Art Market', category: 'market', lat: -8.5069, lng: 115.2625 },
] as const;

async function seedPois(databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM destinations WHERE slug = 'bali'",
    );
    const bali = rows[0]?.id;
    if (bali === undefined) return;
    for (const poi of LOCAL_POIS) {
      await client.query(
        `INSERT INTO pois (destination_id, name, category, lat, lng, curation)
         SELECT $1, $2, $3, $4, $5, 'editorial'
         WHERE NOT EXISTS (SELECT 1 FROM pois WHERE destination_id = $1 AND name = $2)`,
        [bali, poi.name, poi.category, poi.lat, poi.lng],
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
  await seedPois(databaseUrl);
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await seedWorkQueues(client);
    await seedSeasonReview(client);
    await seedAccountAndCommunity(client);
  } finally {
    await client.end();
  }
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
