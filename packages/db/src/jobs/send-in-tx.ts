/**
 * Enqueue-in-transaction (docs/api-contracts-async.md §2.1 "Enqueue"): a job sent through
 * `sendInTx` is written into `pgboss.job` by the caller's own transaction, so it exists exactly when
 * the command's writes do. A rolled-back command leaves no job behind, and a committed one can never
 * lose its job to a crash between "commit" and "send".
 *
 * `pgboss` belongs to app_system and app_user has no grant on it (docs/data-model.md §2). A command
 * transaction usually runs as app_user, so the adapter switches the transaction to app_system for
 * pg-boss's single INSERT and restores the caller's role right after; row security on the caller's
 * own statements is unaffected.
 */
import type { Db, PgBoss, SendOptions } from 'pg-boss';
import type pg from 'pg';

/** The slice of a started `PgBoss` that `sendInTx` needs; a producer-only process can pass one too. */
export type JobProducer = Pick<PgBoss, 'send'>;

/** Every option `send` takes except the connection, which is always the caller's transaction. */
export type SendInTxOptions = Omit<SendOptions, 'db'>;

let producer: JobProducer | undefined;

/** Registers the started pg-boss instance `sendInTx` enqueues through (once per process). */
export function registerJobProducer(next: JobProducer): void {
  producer = next;
}

/** Test-only: forgets the registered producer. */
export function resetJobProducerForTests(): void {
  producer = undefined;
}

async function restoreRole(tx: pg.PoolClient, role: string): Promise<void> {
  await tx.query("SELECT set_config('role', $1, true)", [role]);
}

/** A pg-boss `db` that runs each statement inside `tx` with app_system privileges. */
export function jobTxDatabase(tx: pg.PoolClient): Db {
  return {
    async executeSql(text, values) {
      const { rows } = await tx.query<{ role: string }>('SELECT current_user::text AS role');
      const role = rows[0]?.role;
      if (role === undefined) throw new Error('could not read current_user');
      await tx.query('SET LOCAL ROLE app_system');
      // A failing statement aborts the transaction, which then rolls back as a whole, role switch
      // included; only the success path needs the explicit restore.
      const result = await tx.query(text, values);
      await restoreRole(tx, role);
      return { rows: result.rows };
    },
  };
}

/**
 * Enqueues `data` on `queue` inside `tx`. Resolves to the job id, or `null` when a singleton policy
 * (queue policy or `singletonKey`) folded the send into a job that already exists.
 */
export async function sendInTx(
  tx: pg.PoolClient,
  queue: string,
  data: object | null,
  options: SendInTxOptions = {},
): Promise<string | null> {
  if (producer === undefined) {
    throw new Error('sendInTx: no job producer registered (call registerJobProducer at boot)');
  }
  return producer.send(queue, data, { ...options, db: jobTxDatabase(tx) });
}
