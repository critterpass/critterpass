/**
 * Every console read runs as `admin_reader` (docs/data-model.md §2): SELECT on `ops.*` and the
 * non-C3 columns of `public`, nothing else. A query that names a C3 column fails with a permission
 * error rather than leaking it, and the read-only transaction refuses any write outright.
 */
import type pg from 'pg';

const STATEMENT_TIMEOUT_MS = 10_000;

export async function withAdminReader<T>(
  pool: pg.Pool,
  adminUid: string,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let failure: unknown;
  try {
    await client.query('BEGIN READ ONLY');
    try {
      await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      await client.query('SET LOCAL ROLE admin_reader');
      await client.query("SELECT set_config('app.admin_uid', $1, true)", [adminUid]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      failure = error;
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    client.release(failure !== undefined);
  }
}

/** Opaque keyset cursor over `(sort value, id)`. */
export function encodeCursor(sortValue: string, id: string): string {
  return Buffer.from(JSON.stringify([sortValue, id])).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): readonly [string, string] | undefined {
  if (cursor === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === 'string' &&
      typeof parsed[1] === 'string'
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    // An unreadable cursor restarts from the first page rather than failing the request.
  }
  return undefined;
}
