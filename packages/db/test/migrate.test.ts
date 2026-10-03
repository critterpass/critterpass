import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPool, runMigrations, splitMigrationStatements } from '../src/client';
import { startPostgres, type StartedPostgreSqlContainer } from './helpers/containers';

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await startPostgres();
}, 180_000);

afterAll(async () => {
  await container.stop();
});

describe('runMigrations', () => {
  it('applies every migration once and is a no-op on a second run', async () => {
    const pool = createPool(container.getConnectionUri());
    try {
      const first = await runMigrations(pool);
      expect(first.applied.length).toBeGreaterThan(0);
      expect(first.applied).toEqual([...first.applied].sort());

      const second = await runMigrations(pool);
      expect(second.applied).toEqual([]);
    } finally {
      await pool.end();
    }
  });
});

describe('no-transaction migrations', () => {
  it('builds an index concurrently, records the file only once every statement succeeds, and rebuilds an index a failed run left invalid', async () => {
    const pool = createPool(container.getConnectionUri());
    const dir = await mkdtemp(path.join(tmpdir(), 'migrations-'));
    try {
      await writeFile(
        path.join(dir, '20000101000000_runner_probe.sql'),
        "CREATE TABLE runner_probe (code text);\nINSERT INTO runner_probe VALUES ('a'), ('a'), ('b');\n",
      );
      await writeFile(
        path.join(dir, '20000101000100_runner_probe_unique.sql'),
        [
          '-- migrate:no-transaction',
          '-- One code per row; the build fails while duplicates remain.',
          'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS runner_probe_code_uidx ON runner_probe (code);',
          'CREATE INDEX CONCURRENTLY IF NOT EXISTS runner_probe_upper_idx',
          '  ON runner_probe (upper(code));',
        ].join('\n'),
      );
      const isValid = async (name: string) =>
        (
          await pool.query<{ valid: boolean }>(
            `SELECT i.indisvalid AS valid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
             WHERE c.relname = $1`,
            [name],
          )
        ).rows[0]?.valid;

      await expect(runMigrations(pool, { migrationsDir: dir })).rejects.toThrow(
        /20000101000100_runner_probe_unique\.sql/u,
      );
      expect(await isValid('runner_probe_code_uidx')).toBe(false);
      const recorded = await pool.query(
        `SELECT 1 FROM public._migrations WHERE filename = '20000101000100_runner_probe_unique.sql'`,
      );
      expect(recorded.rowCount).toBe(0);

      await pool.query(
        `DELETE FROM runner_probe WHERE ctid = (SELECT max(ctid) FROM runner_probe WHERE code = 'a')`,
      );
      const retry = await runMigrations(pool, { migrationsDir: dir });
      expect(retry.applied).toEqual(['20000101000100_runner_probe_unique.sql']);
      expect(await isValid('runner_probe_code_uidx')).toBe(true);
      expect(await isValid('runner_probe_upper_idx')).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
      await pool.end();
    }
  });

  it('splits statements at a line-ending semicolon and refuses dollar-quoted bodies', () => {
    expect(splitMigrationStatements('-- note; not a statement\nSELECT 1;\nSELECT\n  2;\n')).toEqual(
      ['SELECT 1', 'SELECT\n  2'],
    );
    expect(() => splitMigrationStatements('DO $$ BEGIN END $$;')).toThrow(/dollar-quoted/u);
  });
});
