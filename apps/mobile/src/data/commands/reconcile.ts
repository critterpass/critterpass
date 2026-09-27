/**
 * Per-op reconcile on synced `cmd_results` (docs/api-contracts.md §2.4 client contract). The
 * result row commits in the same server transaction as the command's writes, and PowerSync applies
 * a checkpoint atomically, so once an op's result has synced its server rows are local too:
 * applied → drop the overlay and the queue entry; rejected → roll the overlay back and list the op
 * as "didn't go through". This also settles ops whose upload response never arrived.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { deleteOverlayRows, recordRejection } from '../powersync/queue-store';

interface SettledRow {
  readonly id: string;
  readonly status: 'applied' | 'rejected' | 'duplicate';
  readonly code: string | null;
  readonly detail: string | null;
  readonly server_ts: string | null;
}

function parseDetail(detail: string | null): unknown {
  if (detail === null) return undefined;
  try {
    return JSON.parse(detail) as unknown;
  } catch {
    return detail;
  }
}

/** Settles every queued op whose server result has synced; returns how many it settled. */
export async function reconcileOnce(db: AbstractPowerSyncDatabase): Promise<number> {
  return db.writeTransaction(async (tx) => {
    const rows = await tx.getAll<SettledRow>(
      `SELECT c.id, r.status, r.code, r.detail, r.server_ts
         FROM commands c JOIN cmd_results r ON r.id = c.id
        ORDER BY c.seq`,
    );
    for (const row of rows) {
      const rejected =
        row.status === 'rejected' || (row.status === 'duplicate' && row.code !== null);
      if (rejected) {
        await recordRejection(tx, {
          opId: row.id,
          code: row.code ?? 'INTERNAL',
          detail: parseDetail(row.detail),
          rejectedAt: row.server_ts ?? new Date().toISOString(),
        });
      } else {
        await deleteOverlayRows(tx, row.id);
        await tx.execute('DELETE FROM commands WHERE id = ?', [row.id]);
      }
    }
    return rows.length;
  });
}

/** Reconciles now and whenever synced results or the queue change; returns the stop function. */
export function startReconcile(
  db: AbstractPowerSyncDatabase,
  onError: (error: unknown) => void = () => undefined,
): () => void {
  const controller = new AbortController();
  const run = () => reconcileOnce(db).catch(onError);
  void run();
  db.onChange(
    {
      onChange: async () => {
        await run();
      },
    },
    { tables: ['cmd_results', 'commands'], throttleMs: 50, signal: controller.signal },
  );
  return () => controller.abort();
}
