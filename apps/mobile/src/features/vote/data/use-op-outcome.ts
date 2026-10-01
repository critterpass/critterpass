/**
 * How a queued command settled, from local rows: still in the upload queue (pending), gone with no
 * refusal (applied, and its server rows have synced with it), or listed as refused with its code.
 * The queue entry and the refusal change in one local transaction, so there is no in-between.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useLiveRows } from './live-rows';

export type OpOutcome =
  | { readonly kind: 'pending' }
  | { readonly kind: 'applied' }
  | { readonly kind: 'rejected'; readonly code: string };

const SQL = `SELECT (SELECT count(*) FROM commands WHERE id = ?) AS queued,
    (SELECT code FROM rejected_commands WHERE id = ?) AS code`;
const TABLES = ['commands', 'rejected_commands'];

/** The outcome of `opId`, or null with no op to follow (or before the first read). */
export function useOpOutcome(opId: string | null): OpOutcome | null {
  const live = useLiveRows<{ queued: number; code: string | null }>(
    SQL,
    opId === null ? null : [opId, opId],
    TABLES,
  );
  const row = live.rows[0];
  if (opId === null || !live.loaded || row === undefined) return null;
  if (row.code !== null) return { kind: 'rejected', code: row.code };
  return row.queued > 0 ? { kind: 'pending' } : { kind: 'applied' };
}
