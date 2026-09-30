/**
 * Billing writes are the server's (every billing table is written by app_system), and they fan out
 * to other users' channels (a boost notifies the whole crew). A command transaction runs as the
 * caller, so billing steps inside one switch to app_system with no acting uid for their duration,
 * then hand the transaction back exactly as it was.
 */
import type pg from 'pg';

export async function asServer<T>(tx: pg.PoolClient, fn: () => Promise<T>): Promise<T> {
  const { rows } = await tx.query<{ role: string; uid: string | null }>(
    "SELECT current_user::text AS role, current_setting('app.uid', true) AS uid",
  );
  const before = rows[0];
  if (before === undefined) throw new Error('could not read the transaction role');
  await tx.query('SET LOCAL ROLE app_system');
  await tx.query("SELECT set_config('app.uid', '', true)");
  const result = await fn();
  await tx.query("SELECT set_config('app.uid', $1, true)", [before.uid ?? '']);
  await tx.query("SELECT set_config('role', $1, true)", [before.role]);
  return result;
}
