/** Helpers for the batched POI upsert (`./ingest-upsert.ts`). */
import type pg from 'pg';

/**
 * Lifts the 15 s statement limit for one ingest write transaction. A 500-row write into `pois`
 * now and then pays for merging the two GIN text indexes' pending lists (`fastupdate`, 4 MB each)
 * into indexes of hundreds of megabytes; with Japanese names, whose trigrams are mostly distinct,
 * that merge passed 15 s often enough to fail nearly every Tokyo tile. The ingest is a background
 * job with its own step limits and expiry, so it waits for the merge instead.
 */
export async function allowIndexMaintenance(tx: pg.PoolClient): Promise<void> {
  await tx.query("SET LOCAL statement_timeout = '90s'");
}

/** Splits `items` into consecutive chunks of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Builds a parameterised multi-row `VALUES (...), (...)` clause: `casts[i]` (when set) is appended to
 * every row's column `i`. Used to batch what used to be one round trip per POI into one round trip
 * per chunk (docs/code-standards.md §13 "parameterised only" — every value is still a bound param,
 * only the placeholder count grows).
 */
export function buildValuesClause(
  rows: readonly (readonly unknown[])[],
  casts: readonly (string | undefined)[],
): { readonly clause: string; readonly params: unknown[] } {
  const params: unknown[] = [];
  const rowClauses = rows.map((row) => {
    const cells = row.map((value, columnIndex) => {
      params.push(value);
      const cast = casts[columnIndex];
      return cast !== undefined ? `$${params.length}::${cast}` : `$${params.length}`;
    });
    return `(${cells.join(', ')})`;
  });
  return { clause: rowClauses.join(', '), params };
}
