import { fileURLToPath } from 'node:url';

import { createPool, runMigrations } from '@cp/db';

/**
 * Railway pre-deploy step: runs before a new api release takes traffic, over the direct (non-PgBouncer)
 * connection, because DDL, advisory-lock migrators and CREATE INDEX CONCURRENTLY break under
 * transaction pooling. A failure here blocks the deploy.
 *
 * tsdown bundles `@cp/db`'s TypeScript into this file, but the SQL migrations it applies are data,
 * not code: services/api/Dockerfile copies packages/db/migrations next to the built dist/migrate.js,
 * so it is resolved relative to this module's own URL rather than the process cwd.
 */
const migrationsDir = fileURLToPath(new URL('./migrations', import.meta.url));

async function main() {
  const url = process.env['DATABASE_DIRECT_URL'];
  if (!url) throw new Error('DATABASE_DIRECT_URL is required for migrations');

  const pool = createPool({ connectionString: url, max: 1 });
  try {
    const { applied } = await runMigrations(pool, { migrationsDir });
    console.log(
      JSON.stringify({
        msg: applied.length > 0 ? 'migrations applied' : 'no pending migrations',
        applied,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ msg: 'migration failed', error: String(error) }));
  process.exit(1);
});
