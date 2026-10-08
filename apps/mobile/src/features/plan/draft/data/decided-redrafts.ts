/**
 * Redrafts she has already kept or put back on this phone. Both commands wait in the local queue
 * until the server has them, and the synced rows (the reservation, the open job) only change after
 * that: until then the draft would still offer the redraft and its screen would ask again. A
 * decision still in the queue counts as made.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and command names, never copy. */
import { useMemo } from 'react';

import { useLiveRows } from './rows';

const DECISIONS_SQL = `SELECT envelope FROM commands
  WHERE cmd IN ('keep_redraft', 'revert_redraft') ORDER BY seq`;
const DECISIONS_TABLES = ['commands'];

/** The redraft ids named by queued keep and put-back commands. */
export function decidedRedraftIds(
  rows: readonly { readonly envelope: string | null }[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    try {
      const envelope = JSON.parse(row.envelope ?? '') as {
        payload?: { redraft_id?: unknown };
      } | null;
      const id = envelope?.payload?.redraft_id;
      if (typeof id === 'string') ids.add(id);
    } catch {
      // An envelope that does not read names no redraft.
    }
  }
  return ids;
}

export function useDecidedRedrafts(): ReadonlySet<string> {
  const queued = useLiveRows<{ envelope: string | null }>(DECISIONS_SQL, [], DECISIONS_TABLES);
  return useMemo(() => decidedRedraftIds(queued.rows), [queued.rows]);
}
