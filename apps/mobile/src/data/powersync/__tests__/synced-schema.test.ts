/**
 * The client schema's synced tables match the server: synced-tables.generated.ts is exactly what
 * the generator renders from the Drizzle schema and the `powersync` publication allow-list today.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { LOCAL_TABLE_NAMES } from '../local-tables';
import { buildAppSchema, parseColumnSpec } from '../schema';
import { SYNCED_TABLE_COLUMNS } from '../synced-tables.generated';
import { openNodeDatabase, removeDir, tempDatabaseDir } from '../test-support/open-node-database';

const GENERATOR = path.join(__dirname, '../test-support/synced-schema-source.ts');
const GENERATED = path.join(__dirname, '../synced-tables.generated.ts');

describe('synced tables', () => {
  it('match the Drizzle schema of every published table', () => {
    const rendered = execFileSync(process.execPath, ['--import', 'tsx', GENERATOR], {
      cwd: path.resolve(__dirname, '../../../..'),
      encoding: 'utf8',
    });
    expect(readFileSync(GENERATED, 'utf8')).toBe(rendered);
  }, 60_000);

  it('carry command results, whose synced rows drive reconcile', () => {
    expect(parseColumnSpec(SYNCED_TABLE_COLUMNS.cmd_results)).toHaveProperty('status');
  });

  it('read the newest messages of one crew from an index, without sorting the table', async () => {
    const dir = tempDatabaseDir();
    const db = await openNodeDatabase({ dir, key: 'a'.repeat(64) });
    try {
      const plan = await db.getAll<{ detail: string }>(
        `EXPLAIN QUERY PLAN
         SELECT m.id, u.display_name FROM messages m LEFT JOIN users u ON u.id = m.sender_id
          WHERE m.crew_id = ? ORDER BY m.seq DESC LIMIT 201`,
        ['crew'],
      );
      const steps = plan.map((step) => step.detail).join('\n');
      expect(steps).toContain('ps_data__messages USING INDEX ps_data__messages__crew_seq');
      expect(steps).not.toContain('TEMP B-TREE');
    } finally {
      await db.close();
      removeDir(dir);
    }
  }, 60_000);

  it('never collide with local-only table names', () => {
    for (const name of LOCAL_TABLE_NAMES) expect(SYNCED_TABLE_COLUMNS).not.toHaveProperty(name);
    expect(() => buildAppSchema().validate()).not.toThrow();
  });

  it('rejects a malformed column spec', () => {
    expect(() => parseColumnSpec('name:float')).toThrow('invalid column spec');
  });
});
