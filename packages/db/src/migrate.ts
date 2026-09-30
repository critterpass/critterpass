/**
 * `pnpm --filter @cp/db migrate`: applies pending migrations to DATABASE_URL (or
 * DATABASE_DIRECT_URL). It is its own entry file because the services bundle `client.ts`: a
 * "was I run directly?" check inside it is true for the bundle's entry, so every service started a
 * migration run at boot.
 */
import { createPool, runMigrations } from './client';

const connectionString = process.env['DATABASE_URL'] ?? process.env['DATABASE_DIRECT_URL'];
if (!connectionString) {
  throw new Error('DATABASE_URL or DATABASE_DIRECT_URL is required to run migrations');
}
const pool = createPool(connectionString);
try {
  const { applied } = await runMigrations(pool);
  console.log(applied.length > 0 ? `applied: ${applied.join(', ')}` : 'no pending migrations');
} finally {
  await pool.end();
}
