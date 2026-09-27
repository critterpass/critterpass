/**
 * Shared pieces of the publish writers: key lookups against the live catalogue, the refusal error
 * and the upsert-then-prune row replacement every catalogue kind uses.
 */
import type pg from 'pg';

type Row = Record<string, unknown>;

export class PublishRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishRefusedError';
  }
}

export async function keyMap(tx: pg.PoolClient, sql: string): Promise<Map<string, string>> {
  const { rows } = await tx.query<{ key: string; id: string }>(sql);
  return new Map(rows.map((row) => [row.key, row.id]));
}

export function lookup(map: ReadonlyMap<string, string>, key: string, what: string): string {
  const id = map.get(key);
  if (id === undefined)
    throw new PublishRefusedError(`${what} ${key} is not in the live catalogue`);
  return id;
}

const JSON_COLUMNS = new Set([
  'month_hints',
  'art_params',
  'palette',
  'rule',
  'geofences',
  'numbers',
]);

/** Upserts rows on `conflict`, then deletes rows in `scope` that the release did not write. */
export async function replaceRows(
  tx: pg.PoolClient,
  table: string,
  conflict: readonly string[],
  rows: readonly Row[],
  releaseId: string,
  scope = 'true',
): Promise<void> {
  for (const row of rows) {
    const record: Row = { ...row, release_id: releaseId };
    const columns = Object.keys(record);
    const values = columns.map((c) =>
      JSON_COLUMNS.has(c) ? JSON.stringify(record[c]) : record[c],
    );
    const updates = columns.filter((c) => !conflict.includes(c)).map((c) => `${c} = EXCLUDED.${c}`);
    await tx.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT (${conflict.join(', ')}) DO UPDATE SET ${updates.join(', ')}`,
      values,
    );
  }
  await tx.query(`DELETE FROM ${table} WHERE release_id <> $1 AND (${scope})`, [releaseId]);
}

export const destinationsBySlug = (tx: pg.PoolClient) =>
  keyMap(tx, 'SELECT slug AS key, id FROM destinations');
