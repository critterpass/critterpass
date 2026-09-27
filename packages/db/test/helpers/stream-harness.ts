/**
 * Evaluates PowerSync Sync Stream queries (infra/powersync/streams/*.yaml, merged by
 * infra/powersync/build-config.ts) directly against a Testcontainers Postgres, per actor.
 *
 * PowerSync replicates with a role that bypasses RLS, so a stream's WHERE clause is the only
 * access control on synced rows. The harness therefore runs each stream query on the owner
 * connection (no RLS), after translating the Sync Streams dialect to Postgres: CTE references
 * (`IN my_crews`) are inlined, `auth.user_id()` and `subscription.parameter('x')` become bind
 * parameters. Syntax the translation does not know is rejected rather than guessed at; the running
 * service validates the same file end to end (test/smoke/powersync-health.ts).
 */
import type pg from 'pg';

import { loadSyncConfig, type SyncConfig } from '../../../../infra/powersync/build-config';
import { buildPermissionFixture, type ActorKind, type PermissionFixture } from './fixtures';
import { startDbTestContainer, type DbTestContainer, type DbTestDatabase } from './pg-container';

/** The actors every stream suite checks (the permission fixture's co-organiser is optional extra). */
export const STREAM_ACTORS = ['outsider', 'exMember', 'member', 'organiser', 'anonymous'] as const;

export interface TranslatedQuery {
  readonly table: string;
  readonly text: string;
  /** Bind values in `$n` order (the caller's id and subscription parameters, by first use). */
  readonly values: (context: StreamContext) => readonly (string | null)[];
}

export interface StreamContext {
  readonly userId: string;
  readonly parameters?: Readonly<Record<string, string>>;
}

/** Rows a stream would sync, grouped by source table (a table queried twice is merged). */
export type StreamRows = ReadonlyMap<string, readonly Record<string, unknown>[]>;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const CTE_REFERENCE = /\bIN\s+([a-z_][a-z0-9_]*)\b/gi;
const SUBSCRIPTION_PARAMETER = /subscription\.parameter\(\s*'([a-z_][a-z0-9_]*)'\s*\)/gi;
const AUTH_USER_ID = /auth\.user_id\(\s*\)/gi;
const UNSUPPORTED = /\b(auth|connection|subscription)\.[a-z_]+\(/i;

function inlineCtes(query: string, ctes: Readonly<Record<string, string>>): string {
  let text = query;
  // CTEs may not reference each other, but an inlined body may sit inside another subquery, so a
  // second pass must find nothing left to replace; anything still unresolved is a typo.
  for (let pass = 0; pass < 2; pass += 1) {
    text = text.replace(CTE_REFERENCE, (match, name: string) => {
      const body = ctes[name];
      return body === undefined ? match : `IN (${body})`;
    });
  }
  return text;
}

/** The table named by the outermost FROM (parenthesised subqueries and literals are skipped). */
export function outerTable(query: string): string {
  let depth = 0;
  let quoted = false;
  let outer = '';
  for (const char of query) {
    if (char === "'") quoted = !quoted;
    else if (!quoted && char === '(') depth += 1;
    else if (!quoted && char === ')') depth -= 1;
    else if (!quoted && depth === 0) outer += char;
  }
  const table = /\bFROM\s+([a-z_][a-z0-9_]*)/i.exec(outer)?.[1];
  if (table === undefined) throw new Error(`no outer FROM table in stream query: ${query}`);
  return table;
}

/** Every table a query reads, including subquery tables (CTE names resolved first). */
export function referencedTables(query: string, ctes: Readonly<Record<string, string>>): string[] {
  const text = inlineCtes(query, ctes);
  const tables = new Set<string>();
  for (const match of text.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi)) {
    if (match[1] !== undefined) tables.add(match[1]);
  }
  return [...tables];
}

const USER_ID = Symbol('auth.user_id()');

export function translateQuery(
  query: string,
  ctes: Readonly<Record<string, string>>,
): TranslatedQuery {
  // Placeholders are numbered by first appearance; each maps to the caller's id or a parameter.
  const bindings: (typeof USER_ID | string)[] = [];
  const placeholder = (binding: typeof USER_ID | string): string => {
    let position = bindings.indexOf(binding);
    if (position === -1) position = bindings.push(binding) - 1;
    return `$${position + 1}`;
  };
  const text = inlineCtes(query, ctes)
    .replace(AUTH_USER_ID, () => placeholder(USER_ID))
    .replace(SUBSCRIPTION_PARAMETER, (_match, name: string) => placeholder(name));
  if (UNSUPPORTED.test(text)) throw new Error(`unsupported stream parameter syntax: ${query}`);
  const leftover = [...text.matchAll(CTE_REFERENCE)].map((match) => match[1]);
  if (leftover.length > 0) throw new Error(`unresolved CTE ${leftover.join(', ')} in: ${query}`);
  return {
    table: outerTable(text),
    text,
    values: (context) =>
      bindings.map((binding) =>
        binding === USER_ID ? context.userId : (context.parameters?.[binding] ?? null),
      ),
  };
}

export function streamQueries(config: SyncConfig, streamName: string): TranslatedQuery[] {
  const stream = config.streams[streamName];
  if (stream === undefined) throw new Error(`unknown stream ${streamName}`);
  const ctes = { ...config.with, ...stream.with };
  return stream.queries.map((query) => translateQuery(query, ctes));
}

export async function evaluateStream(
  pool: pg.Pool,
  config: SyncConfig,
  streamName: string,
  context: StreamContext,
): Promise<StreamRows> {
  const rows = new Map<string, Record<string, unknown>[]>();
  for (const query of streamQueries(config, streamName)) {
    const result = await pool.query<Record<string, unknown>>(query.text, [
      ...query.values(context),
    ]);
    rows.set(query.table, [...(rows.get(query.table) ?? []), ...result.rows]);
  }
  return rows;
}

/** `id` values per table, sorted, for compact assertions. */
export function idsByTable(rows: StreamRows): Record<string, string[]> {
  return Object.fromEntries(
    [...rows].map(([table, tableRows]) => [
      table,
      tableRows.map((row) => String(row['id'])).sort(),
    ]),
  );
}

export function totalRows(rows: StreamRows): number {
  let total = 0;
  for (const tableRows of rows.values()) total += tableRows.length;
  return total;
}

export interface StreamHarness {
  readonly db: DbTestDatabase;
  readonly config: SyncConfig;
  readonly fixture: PermissionFixture;
  /** Rows `streamName` syncs to the given fixture actor. */
  rows(
    streamName: string,
    actor: ActorKind,
    parameters?: Readonly<Record<string, string>>,
  ): Promise<StreamRows>;
  stop(): Promise<void>;
}

/** One container + migrated database + permission fixture + merged stream config per test file. */
export async function startStreamHarness(): Promise<StreamHarness> {
  const container: DbTestContainer = await startDbTestContainer();
  const db = await container.createDatabase();
  const [config, fixture] = await Promise.all([loadSyncConfig(), buildPermissionFixture(db.pool)]);
  for (const name of Object.keys(config.streams)) {
    if (!IDENTIFIER.test(name)) throw new Error(`stream name ${name} is not a plain identifier`);
  }
  return {
    db,
    config,
    fixture,
    rows: (streamName, actor, parameters) =>
      evaluateStream(db.pool, config, streamName, {
        userId: fixture.actors[actor],
        ...(parameters === undefined ? {} : { parameters }),
      }),
    async stop() {
      await db.drop();
      await container.stop();
    },
  };
}
