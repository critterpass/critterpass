/**
 * Every `public`-schema table with a `user_id` column has a registered merge rule
 * (packages/db/src/merge-rules.ts) — introspected against a live database, not just the migration
 * SQL, so a column added by a trigger-generated or later migration is caught the same way.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getMergeRule, MERGE_STRATEGIES } from '../src/merge-rules';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from './helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('merge rule coverage', () => {
  it('gives every public table with a user_id column a registered merge rule', async () => {
    const { rows } = await db.pool.query<{ table_name: string }>(
      // Base tables only: a view (member_balances) holds no rows of its own to merge.
      `SELECT DISTINCT c.table_name FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
       WHERE c.table_schema = 'public' AND c.column_name = 'user_id'
         AND t.table_type = 'BASE TABLE'
       ORDER BY c.table_name`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const rule = getMergeRule(row.table_name);
      expect(rule, `${row.table_name} should have a registered merge rule`).toBeDefined();
      expect(MERGE_STRATEGIES).toContain(rule?.strategy);
    }
  });

  it('names a real column on the real table for every registered rule', async () => {
    const { rows } = await db.pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    const columnsByTable = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = columnsByTable.get(row.table_name) ?? new Set<string>();
      set.add(row.column_name);
      columnsByTable.set(row.table_name, set);
    }
    const { listMergeRules } = await import('../src/merge-rules');
    for (const rule of listMergeRules()) {
      const columns = columnsByTable.get(rule.table);
      expect(columns, `merge rule references unknown table "${rule.table}"`).toBeDefined();
      expect(
        columns?.has(rule.userColumn),
        `merge rule for "${rule.table}" references unknown column "${rule.userColumn}"`,
      ).toBe(true);
      for (const conflictColumn of rule.conflictColumns ?? []) {
        expect(
          columns?.has(conflictColumn),
          `merge rule for "${rule.table}" references unknown conflict column "${conflictColumn}"`,
        ).toBe(true);
      }
    }
  });
});
