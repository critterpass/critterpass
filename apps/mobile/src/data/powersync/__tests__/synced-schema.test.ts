/**
 * The client schema's synced tables match the server: synced-tables.generated.ts is exactly what
 * the generator renders from the Drizzle schema and the `powersync` publication allow-list today.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, jest } from '@jest/globals';

import { LOCAL_TABLE_NAMES } from '../local-tables';
import { buildAppSchema, parseColumnSpec } from '../schema';
import { SYNCED_TABLE_COLUMNS } from '../synced-tables.generated';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../test-support/node-realm').powersyncCommon,
);

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

  it('never collide with local-only table names', () => {
    for (const name of LOCAL_TABLE_NAMES) expect(SYNCED_TABLE_COLUMNS).not.toHaveProperty(name);
    expect(() => buildAppSchema().validate()).not.toThrow();
  });

  it('rejects a malformed column spec', () => {
    expect(() => parseColumnSpec('name:float')).toThrow('invalid column spec');
  });
});
