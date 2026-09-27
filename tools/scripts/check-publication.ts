/**
 * Compares the live `powersync` publication against `@cp/db`'s allow-list (docs/data-model.md §1;
 * docs/code-standards.md §13) and fails on any drift in either direction: a table missing from the
 * publication (a migration that did not apply) or an extra table present (a C3/S table that leaked
 * in). Read-only: never modifies the publication itself.
 *
 *   pnpm tsx tools/scripts/check-publication.ts
 */
import { computePublicationAllowList, createPool } from '@cp/db';
import type pg from 'pg';

export interface PublicationDiff {
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];
}

/** Pure diff: tables the allow-list expects but the publication lacks, and vice versa. */
export function diffPublication(
  actualTables: readonly string[],
  allowList: readonly string[],
): PublicationDiff {
  const actual = new Set(actualTables);
  const allowed = new Set(allowList);
  return {
    missing: allowList.filter((table) => !actual.has(table)),
    unexpected: actualTables.filter((table) => !allowed.has(table)),
  };
}

async function fetchPublishedTables(pool: pg.Pool): Promise<readonly string[]> {
  const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_publication_tables WHERE pubname = 'powersync'",
  );
  return rows.map((row) => row.tablename);
}

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'] ?? process.env['DATABASE_DIRECT_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_DIRECT_URL is required to check the publication');
  }

  const pool = createPool(connectionString);
  try {
    const [actualTables, allowList] = await Promise.all([
      fetchPublishedTables(pool),
      Promise.resolve(computePublicationAllowList()),
    ]);
    const diff = diffPublication(actualTables, allowList);

    if (diff.missing.length === 0 && diff.unexpected.length === 0) {
      console.log(`ok    powersync publication matches the allow-list (${allowList.length} tables)`);
      return;
    }

    console.error('Publication check failed:');
    for (const table of diff.missing) console.error(`  - missing from publication: ${table}`);
    for (const table of diff.unexpected) console.error(`  - unexpected in publication: ${table}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
