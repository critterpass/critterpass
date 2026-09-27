/**
 * Optimistic overlay rows (docs/data-model-sync-and-privacy.md §4 write path): a queued command's
 * local effect is written to `overlay_<entity>` tables — never to the synced table itself — tagged
 * with the command's `op_id`. Reads union the synced table with its overlay; reconcile drops the
 * overlay once the server's own rows have synced, or rolls it back on a reject.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL or a developer-facing error, never copy. */
import type { LockContext } from '@powersync/common';

import { OVERLAY_TABLE_PREFIX } from '../powersync/local-tables';

export { deleteOverlayRows } from '../powersync/queue-store';

export type OverlayValue = string | number | null;

export interface OverlayWrite {
  /** An overlay table name, as returned by `registerOverlayTable()`. */
  readonly table: string;
  /** The optimistic row; `id` is the id the server row will have. */
  readonly row: Readonly<Record<string, OverlayValue>> & { readonly id: string };
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function assertIdentifier(name: string): void {
  if (!IDENTIFIER.test(name)) throw new Error(`invalid overlay identifier: ${name}`);
}

/** Writes a command's optimistic rows, inside the transaction that queues the command. */
export async function writeOverlays(
  tx: LockContext,
  opId: string,
  writes: readonly OverlayWrite[],
): Promise<void> {
  for (const { table, row } of writes) {
    if (!table.startsWith(OVERLAY_TABLE_PREFIX)) {
      throw new Error(`optimistic rows must go to an overlay table, not ${table}`);
    }
    assertIdentifier(table);
    const columns = Object.keys(row);
    columns.forEach(assertIdentifier);
    await tx.execute(
      `INSERT OR REPLACE INTO "${table}" (${[...columns, 'op_id'].join(', ')})
       VALUES (${[...columns, 'op_id'].map(() => '?').join(', ')})`,
      [...columns.map((column) => row[column] ?? null), opId],
    );
  }
}
