/**
 * Reads as `public_reader`: the role behind every public web read. It sees only the public views,
 * and a link's views answer only for the one link named in the transaction's settings.
 */
import type pg from 'pg';

/** The link a public read is scoped to; every other setting stays unset. */
export interface PublicScope {
  readonly code?: string | null;
  readonly seatHash?: string | null;
  /** sha-256 hex of a plan link's token. */
  readonly planHash?: string | null;
}

const STATEMENT_TIMEOUT_MS = 5_000;

/** Runs `fn` as `public_reader` with only this link's settings. */
export async function asPublicReader<T>(
  pool: pg.Pool,
  scope: PublicScope,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let failure: unknown;
  try {
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      await client.query('SET LOCAL ROLE public_reader');
      await client.query(
        `SELECT set_config('app.public_code', $1, true), set_config('app.public_seat', $2, true),
                set_config('app.public_plan', $3, true)`,
        [scope.code ?? '', scope.seatHash ?? '', scope.planHash ?? ''],
      );
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
