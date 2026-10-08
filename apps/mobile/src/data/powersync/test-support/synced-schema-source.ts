/**
 * Renders `../synced-tables.generated.ts` from the Drizzle schema: one PowerSync table per table in
 * the `powersync` publication allow-list, plus each table a stream fills by alias (`FROM place_cards
 * AS pois` keeps the phone's `pois` table while `pois` itself is not published), one column per
 * Drizzle column, and the local indexes listed in `./local-indexes`. Run as its own Node
 * process (`tsx`), never bundled: the app may not import `@cp/db` (server-only, lint-enforced), so
 * the server package is loaded by file path at generation time only.
 *
 *   tsx synced-schema-source.ts            → prints the file to stdout
 *   tsx synced-schema-source.ts --write    → rewrites ../synced-tables.generated.ts in place
 *
 * Type mapping follows PowerSync's replication of Postgres values: integer and boolean types arrive
 * as SQLite integers, floating point as reals, and everything else (uuid, numeric, timestamps, json,
 * arrays, geography) as text — `numeric` stays text so money never passes through a float.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { LOCAL_INDEXES, type LocalIndex } from './local-indexes';

interface DrizzleColumn {
  readonly name: string;
  getSQLType(): string;
}

interface DrizzleTableConfig {
  readonly name: string;
  readonly schema: string | undefined;
  readonly columns: readonly DrizzleColumn[];
}

interface DbPackage {
  computePublicationAllowList(): readonly string[];
  schema: Record<string, unknown>;
}

interface PgCore {
  getTableConfig(table: unknown): DrizzleTableConfig;
  PgTable: abstract new (...args: never[]) => unknown;
}

interface DrizzleOrm {
  is(value: unknown, type: unknown): boolean;
}

const REPO_ROOT = path.resolve(__dirname, '../../../../../..');
const DB_PACKAGE_DIR = path.join(REPO_ROOT, 'packages/db');
const OUTPUT_FILE = path.resolve(__dirname, '../synced-tables.generated.ts');
// Tables streamed by alias but no longer published (`FROM place_cards AS pois`): the phone keeps them.
const STREAM_ALIAS_TABLES = ['pois'];

const INTEGER_TYPES = new Set(['integer', 'bigint', 'smallint', 'boolean', 'serial', 'bigserial']);
const REAL_TYPES = new Set(['double precision', 'real']);

function powersyncColumnType(sqlType: string): 'integer' | 'real' | 'text' {
  if (INTEGER_TYPES.has(sqlType)) return 'integer';
  if (REAL_TYPES.has(sqlType)) return 'real';
  return 'text';
}

async function loadTables(): Promise<DrizzleTableConfig[]> {
  const db = (await import(
    pathToFileURL(path.join(DB_PACKAGE_DIR, 'src/index.ts')).href
  )) as DbPackage;
  const dbRequire = createRequire(path.join(DB_PACKAGE_DIR, 'package.json'));
  const pgCore = (await import(
    pathToFileURL(dbRequire.resolve('drizzle-orm/pg-core')).href
  )) as PgCore;
  const drizzle = (await import(
    pathToFileURL(dbRequire.resolve('drizzle-orm')).href
  )) as DrizzleOrm;

  const published = new Set([...db.computePublicationAllowList(), ...STREAM_ALIAS_TABLES]);
  const configs = Object.values(db.schema)
    .filter((value) => drizzle.is(value, pgCore.PgTable))
    .map((table) => pgCore.getTableConfig(table))
    // The publication only carries `public` tables; other schemas (e.g. `llm.pois`) reuse names.
    .filter((config) => (config.schema ?? 'public') === 'public' && published.has(config.name));
  const missing = [...published].filter((name) => !configs.some((c) => c.name === name));
  if (missing.length > 0) {
    throw new Error(`published tables without a Drizzle definition: ${missing.join(', ')}`);
  }
  return configs.sort((a, b) => a.name.localeCompare(b.name));
}

/** `name` for text, `name:integer` / `name:real` otherwise — one line per table keeps the file small. */
function columnSpec(column: DrizzleColumn): string {
  const type = powersyncColumnType(column.getSQLType());
  return type === 'text' ? column.name : `${column.name}:${type}`;
}

/** Every listed index, by table; an index on a table or column the phone does not hold is an error. */
function indexesByTable(
  tables: readonly DrizzleTableConfig[],
  indexes: readonly LocalIndex[],
): Map<string, LocalIndex[]> {
  const byTable = new Map<string, LocalIndex[]>();
  for (const index of indexes) {
    const label = `${index.table}.${index.name}`;
    const table = tables.find((candidate) => candidate.name === index.table);
    if (table === undefined) throw new Error(`index ${label}: the table is not synced`);
    const unknown = index.columns.filter((name) => !table.columns.some((c) => c.name === name));
    if (index.columns.length === 0 || unknown.length > 0) {
      throw new Error(`index ${label}: unknown or missing columns ${unknown.join(', ')}`);
    }
    const listed = byTable.get(index.table) ?? [];
    if (listed.some((other) => other.name === index.name)) {
      throw new Error(`index ${label}: listed twice`);
    }
    byTable.set(index.table, [...listed, index]);
  }
  return byTable;
}

function render(tables: readonly DrizzleTableConfig[]): string {
  const lines = [
    '/**',
    ' * GENERATED by test-support/synced-schema-source.ts from the Drizzle schema and the `powersync`',
    ' * publication allow-list. Do not edit: run `pnpm --filter @cp/mobile exec tsx',
    ' * src/data/powersync/test-support/synced-schema-source.ts --write`; the synced-schema test',
    " * fails whenever this file and the server schema disagree. Each value lists the table's columns",
    ' * (`name` = text, `name:integer`, `name:real`); PowerSync adds `id` itself, and streams alias',
    ' * another key to `id` where a table has none. The indexes come from',
    ' * test-support/local-indexes.ts, which says what each one is for.',
    ' */',
    '/* eslint-disable lingui/no-unlocalized-strings -- column lists, never rendered copy. */',
    'export const SYNCED_TABLE_COLUMNS = {',
  ];
  for (const table of tables) {
    const spec = table.columns
      .filter((c) => c.name !== 'id')
      .map(columnSpec)
      .join(' ');
    lines.push(`  ${table.name}: '${spec}',`);
  }
  lines.push(
    '} as const;',
    '',
    '/** Local indexes per table: index name → its columns, in order. */',
    'export const SYNCED_TABLE_INDEXES: Partial<',
    '  Record<keyof typeof SYNCED_TABLE_COLUMNS, Readonly<Record<string, readonly string[]>>>',
    '> = {',
  );
  const indexes = indexesByTable(tables, LOCAL_INDEXES);
  for (const table of tables) {
    const listed = indexes.get(table.name);
    if (listed === undefined) continue;
    const entries = listed.map(
      (index) => `${index.name}: [${index.columns.map((name) => `'${name}'`).join(', ')}]`,
    );
    lines.push(`  ${table.name}: { ${entries.join(', ')} },`);
  }
  lines.push('};', '');
  return lines.join('\n');
}

interface Prettier {
  format(source: string, options: Record<string, unknown>): Promise<string>;
  resolveConfig(file: string): Promise<Record<string, unknown> | null>;
}

/** Formats with the repo's own prettier config, so the file passes `format:check` as generated. */
async function formatted(source: string): Promise<string> {
  const rootRequire = createRequire(path.join(REPO_ROOT, 'package.json'));
  const loaded = (await import(pathToFileURL(rootRequire.resolve('prettier')).href)) as {
    default?: Prettier;
  } & Prettier;
  const prettier = loaded.default ?? loaded;
  const config = (await prettier.resolveConfig(OUTPUT_FILE)) ?? {};
  return prettier.format(source, { ...config, filepath: OUTPUT_FILE });
}

async function main(): Promise<void> {
  const source = await formatted(render(await loadTables()));
  if (process.argv.includes('--write')) {
    writeFileSync(OUTPUT_FILE, source);
    return;
  }
  process.stdout.write(source);
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error instanceof Error ? error.stack : error)}\n`);
  process.exit(1);
});
