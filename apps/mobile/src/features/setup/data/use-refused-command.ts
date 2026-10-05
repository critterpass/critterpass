/**
 * A queued setup command the server refused after the app had already moved on. `set_setup_step`
 * and `set_stay_choice` work offline, so the app answers the tap at once and the server's answer
 * arrives later; when it is a refusal the entry stays in the "didn't go through" list until the
 * person acts again, so the step can say why (and it survives the screen being replaced).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useCallback } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { useLiveRows } from './rows';

const REFUSED_SQL = `SELECT id, detail FROM rejected_commands WHERE cmd = ?
  ORDER BY rejected_at DESC`;
const TABLES = ['rejected_commands'];

function reasonOf(detail: string | null | undefined): string | null {
  if (detail === null || detail === undefined) return null;
  try {
    const reason = (JSON.parse(detail) as { reason?: unknown } | null)?.reason;
    return typeof reason === 'string' ? reason : null;
  } catch {
    return null;
  }
}

export function useRefusedCommand(cmd: 'set_setup_step' | 'set_stay_choice'): {
  /** The command was refused and the person has not acted again since. */
  readonly refused: boolean;
  /** The server's reason for the newest refusal (`step_not_done`, `stay_unavailable`, …). */
  readonly reason: string | null;
  /** The refusals have been read at least once (until then `refused` is not yet known). */
  readonly loaded: boolean;
  readonly acknowledge: () => void;
} {
  const { db } = useLocalFirst();
  const rows = useLiveRows<{ id: string; detail: string | null }>(REFUSED_SQL, [cmd], TABLES);
  const acknowledge = useCallback(() => {
    void db.execute('DELETE FROM rejected_commands WHERE cmd = ?', [cmd]).catch(() => undefined);
  }, [db, cmd]);
  return {
    refused: rows.rows.length > 0,
    reason: reasonOf(rows.rows[0]?.detail),
    loaded: rows.loaded,
    acknowledge,
  };
}
