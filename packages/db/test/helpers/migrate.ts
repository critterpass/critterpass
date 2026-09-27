/**
 * Thin, test-facing entry point over the production migration runner, kept separate so test
 * helpers do not depend on src/client.ts's exact signature evolving for CLI/env concerns.
 */
import type pg from 'pg';

import { runMigrations } from '../../src/client';

/** Applies every migration to a freshly started test database, in filename order, once. */
export async function migrateTestDatabase(pool: pg.Pool): Promise<void> {
  await runMigrations(pool);
}
