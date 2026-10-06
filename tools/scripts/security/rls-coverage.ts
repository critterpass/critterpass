/**
 * Static row-level-security coverage, read from the migrations alone (no database):
 *
 *   pnpm tsx tools/scripts/security/rls-coverage.ts [--json]
 *
 * For every `public` table the migrations leave behind it reports whether RLS is enabled and
 * forced, whether `app_user` (the request role) was ever granted anything on it, and whether the
 * permission matrix (packages/db/test/permissions/_matrix.ts) has an entry. It fails when a table
 * enables RLS without forcing it, when an RLS table has no matrix entry, or when the request role
 * holds a grant on a table without RLS. The live catalogue check is the matrix suite in CI; this
 * one is the report a reviewer can read without a database.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TableState {
  rls: boolean;
  forced: boolean;
  /** The request role was granted something on the table at some point (revokes are not tracked). */
  requestRoleGrant: boolean;
}

const NAME = String.raw`(?:public\.)?"?([a-z_][a-z_0-9]*)"?`;
const QUALIFIED = String.raw`((?:[a-z_]+\.)?"?[a-z_][a-z_0-9]*"?)`;

type Apply = (tables: Map<string, TableState>, match: RegExpExecArray) => void;

/** `auth.x` and `ops.x` live outside `public`; only bare or `public.`-qualified names count. */
function publicName(raw: string): string | undefined {
  const clean = raw.replaceAll('"', '').toLowerCase();
  if (!clean.includes('.')) return clean;
  return clean.startsWith('public.') ? clean.slice('public.'.length) : undefined;
}

const touch = (tables: Map<string, TableState>, name: string, change: Partial<TableState>) => {
  const state = tables.get(name);
  if (state) Object.assign(state, change);
};

const quoted = (list: string) =>
  [...list.matchAll(/'([a-z_][a-z_0-9]*)'/giu)].map((m) => m[1] ?? '');

const RULES: readonly (readonly [RegExp, Apply])[] = [
  [
    new RegExp(
      String.raw`create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${QUALIFIED}`,
      'giu',
    ),
    (tables, m) => {
      const name = publicName(m[1] ?? '');
      if (name && !tables.has(name)) {
        tables.set(name, { rls: false, forced: false, requestRoleGrant: false });
      }
    },
  ],
  [
    // `ALTER PUBLICATION p DROP TABLE t` takes a table out of a publication; the table stays.
    new RegExp(
      String.raw`(?<!publication\s+\w+\s+)drop\s+table\s+(?:if\s+exists\s+)?([^;]+);`,
      'giu',
    ),
    (tables, m) => {
      for (const raw of (m[1] ?? '').replace(/\s+(cascade|restrict)\s*$/iu, '').split(',')) {
        const name = publicName(raw.trim());
        if (name) tables.delete(name);
      }
    },
  ],
  [
    new RegExp(String.raw`alter\s+table\s+(?:only\s+)?${NAME}\s+rename\s+to\s+${NAME}`, 'giu'),
    (tables, m) => {
      const state = tables.get((m[1] ?? '').toLowerCase());
      if (!state) return;
      tables.delete((m[1] ?? '').toLowerCase());
      tables.set((m[2] ?? '').toLowerCase(), state);
    },
  ],
  [
    new RegExp(
      String.raw`alter\s+table\s+(?:only\s+)?${NAME}\s+(enable|force|disable|no\s+force)\s+row\s+level\s+security`,
      'giu',
    ),
    (tables, m) => {
      const verb = (m[2] ?? '').toLowerCase().replace(/\s+/gu, ' ');
      const change: Partial<TableState> =
        verb === 'enable'
          ? { rls: true }
          : verb === 'force'
            ? { forced: true }
            : verb === 'disable'
              ? { rls: false }
              : { forced: false };
      touch(tables, (m[1] ?? '').toLowerCase(), change);
    },
  ],
  [
    // GRANT <privileges> ON [TABLE] a, b TO role, role
    /grant\s+[^;]+?\s+on\s+(?:table\s+)?([^;%]+?)\s+to\s+([^;]+);/giu,
    (tables, m) => {
      if (!/\bapp_user\b/iu.test(m[2] ?? '')) return;
      for (const raw of (m[1] ?? '').split(',')) {
        const name = publicName(raw.trim());
        if (name) touch(tables, name, { requestRoleGrant: true });
      }
    },
  ],
  [
    // DO blocks that loop over a list of tables and EXECUTE format('... %I ...', t).
    /foreach\s+\w+\s+in\s+array\s+array\s*\[([^\]]*)\]\s*loop([\s\S]*?)end\s+loop/giu,
    (tables, m) => {
      const body = m[2] ?? '';
      const change: Partial<TableState> = {};
      if (/alter\s+table\s+%I\s+enable\s+row\s+level\s+security/iu.test(body)) change.rls = true;
      if (/alter\s+table\s+%I\s+force\s+row\s+level\s+security/iu.test(body)) change.forced = true;
      if (/grant\s+[^']+?\s+on\s+%I\s+to\s+[^']*\bapp_user\b/iu.test(body)) {
        change.requestRoleGrant = true;
      }
      for (const name of quoted(m[1] ?? '')) touch(tables, name.toLowerCase(), change);
    },
  ],
];

const stripComments = (sql: string) =>
  sql.replace(/--[^\n]*/gu, '').replace(/\/\*[\s\S]*?\*\//gu, '');

/** Replays the migrations in order (each as `[name, sql]`) into the final state of every table. */
export function replayMigrations(migrations: readonly (readonly [string, string])[]) {
  const tables = new Map<string, TableState>();
  for (const [, raw] of [...migrations].sort(([a], [b]) => a.localeCompare(b))) {
    const sql = stripComments(raw);
    const events: { at: number; run: () => void }[] = [];
    for (const [pattern, apply] of RULES) {
      for (const match of sql.matchAll(pattern)) {
        events.push({ at: match.index, run: () => apply(tables, match) });
      }
    }
    for (const event of events.sort((a, b) => a.at - b.at)) event.run();
  }
  return tables;
}

/**
 * The table names `TABLE_MATRIX` covers in the matrix source: its literal keys, plus the lists it
 * spreads in as `...Object.fromEntries([ 'a', 'b' ].map(...))`.
 */
export function matrixTables(source: string): Set<string> {
  const start = source.indexOf('export const TABLE_MATRIX');
  const body = start < 0 ? '' : source.slice(start);
  const keys = [...body.matchAll(/^ {2}'?([a-z_][a-z_0-9]*)'?: \{/gmu)].map((m) => m[1] ?? '');
  const spread = [...body.matchAll(/Object\.fromEntries\(\s*\[([^\]]*)\]\s*\.map/gu)].flatMap((m) =>
    quoted(m[1] ?? ''),
  );
  return new Set([...keys, ...spread]);
}

export interface Coverage {
  readonly total: number;
  readonly withRls: number;
  /** No RLS and no request-role grant: reference or system-only tables. */
  readonly withoutRls: readonly string[];
  readonly problems: readonly string[];
}

export function coverage(tables: ReadonlyMap<string, TableState>, matrix: ReadonlySet<string>) {
  const problems: string[] = [];
  const withoutRls: string[] = [];
  let withRls = 0;
  for (const [name, state] of [...tables].sort(([a], [b]) => a.localeCompare(b))) {
    if (state.rls) {
      withRls += 1;
      if (!state.forced) problems.push(`${name}: RLS enabled but not forced`);
      if (!matrix.has(name)) problems.push(`${name}: no permission matrix entry`);
    } else if (state.requestRoleGrant) {
      problems.push(`${name}: the request role holds a grant but the table has no RLS`);
    } else {
      withoutRls.push(name);
    }
  }
  return { total: tables.size, withRls, withoutRls, problems } satisfies Coverage;
}

function main(): void {
  const root = path.resolve(import.meta.dirname, '../../..');
  const dir = path.join(root, 'packages/db/migrations');
  const migrations = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => [file, readFileSync(path.join(dir, file), 'utf8')] as const);
  const matrix = matrixTables(
    readFileSync(path.join(root, 'packages/db/test/permissions/_matrix.ts'), 'utf8'),
  );
  const result = coverage(replayMigrations(migrations), matrix);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${migrations.length} migrations, ${result.total} public tables`);
    console.log(`RLS enabled: ${result.withRls}; matrix entries: ${matrix.size}`);
    console.log(`without RLS and without a request-role grant (${result.withoutRls.length}):`);
    console.log(`  ${result.withoutRls.join(', ') || 'none'}`);
    console.log(`problems (${result.problems.length}):`);
    for (const problem of result.problems) console.log(`  ${problem}`);
  }
  process.exitCode = result.problems.length === 0 ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
