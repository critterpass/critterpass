/**
 * Per-transaction identity for the RLS backstop (docs/data-model.md §2, docs/system-architecture.md
 * §5). Every setting here is `SET LOCAL`: it evaporates at COMMIT/ROLLBACK and never leaks onto a
 * PgBouncer-pooled backend connection reused by an unrelated request.
 */
import type pg from 'pg';

/** Local settings are never NULL/undefined on the wire; empty string reads back as unset via app.uid()/app.device(). */
const STATEMENT_TIMEOUT_MS = 15_000;

type DbRole = 'app_user' | 'app_system' | 'guide_reader';

async function runInRole<T>(
  pool: pg.Pool,
  role: DbRole,
  localSettings: ReadonlyArray<readonly [name: string, value: string]>,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let failure: unknown;
  try {
    await client.query('BEGIN');
    try {
      // Role names come only from the DbRole union below, never caller input: safe to inline.
      await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      await client.query(`SET LOCAL ROLE ${role}`);
      for (const [name, value] of localSettings) {
        await client.query('SELECT set_config($1, $2, true)', [name, value]);
      }
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      failure = error;
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    // On failure, tell the pool to destroy this connection instead of reusing it: SET LOCAL
    // settings do reset on ROLLBACK, but a socket that errored mid-transaction should not recirculate.
    client.release(failure !== undefined);
  }
}

/** Runs `fn` as `app_user` with `app.uid`/`app.device` set for the RLS backstop. */
export function withUser<T>(
  pool: pg.Pool,
  uid: string,
  device: string,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return runInRole(
    pool,
    'app_user',
    [
      ['app.uid', uid],
      ['app.device', device],
    ],
    fn,
  );
}

/** Runs `fn` as `app_system` (worker/system jobs); `app.uid` is left unset. */
export function withSystem<T>(pool: pg.Pool, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  return runInRole(pool, 'app_system', [], fn);
}

/** Runs `fn` as `guide_reader` (AI context assembly), scoped to one user and trip. */
export function withGuideReader<T>(
  pool: pg.Pool,
  uid: string,
  tripId: string,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return runInRole(
    pool,
    'guide_reader',
    [
      ['app.uid', uid],
      ['app.trip', tripId],
    ],
    fn,
  );
}
