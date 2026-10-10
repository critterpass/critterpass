/**
 * What a crew chat `expense` message points at, read from the synced rows (so it works offline):
 * the expense with its payer and how many people share it, or that it is gone (deleted by someone,
 * by a delete still in this device's queue, or never synced to a trip that is) with who removed
 * it, or still loading. The card holds the trip's stream while it is on screen.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { useLiveRows } from '../data/live-rows';
import { minor, UID_SQL, UID_TABLES } from '../data/queries';
import { useExpenseTrip } from './use-trip-synced';

export const CHAT_EXPENSE_SQL = `SELECT e.id, e.payer_id, e.amount_minor, e.currency, e.split_mode,
    e.category, e.description, e.merchant, e.deleted_at, u.display_name AS payer_name
  FROM expenses e LEFT JOIN users u ON u.id = e.payer_id WHERE e.id = ?`;
export const CHAT_EXPENSE_SHARES_SQL = `SELECT computed_minor FROM expense_shares
  WHERE expense_id = ?`;
export const CHAT_EXPENSE_REMOVED_SQL = `SELECT ed.editor_id, u.display_name AS editor_name
  FROM expense_edits ed LEFT JOIN users u ON u.id = ed.editor_id
  WHERE ed.expense_id = ? AND ed.kind = 'deleted' ORDER BY ed.at DESC LIMIT 1`;
/** A delete of this expense still in this device's queue (or sent, its synced result not in yet). */
export const CHAT_EXPENSE_QUEUED_DELETE_SQL = `SELECT 1 AS queued FROM commands
  WHERE cmd = 'delete_expense' AND json_extract(envelope, '$.payload.expense_id') = ? LIMIT 1`;
const TABLES = ['expenses', 'users', 'expense_shares'];
const EDIT_TABLES = ['expense_edits', 'users'];

export interface ChatExpenseRow {
  readonly id: string;
  readonly payer_id: string;
  readonly amount_minor: number | string;
  readonly currency: string;
  readonly split_mode: string;
  readonly category: string | null;
  readonly description: string | null;
  readonly merchant: string | null;
  readonly deleted_at: string | null;
  readonly payer_name: string | null;
}

interface RemovedRow {
  readonly editor_id: string | null;
  readonly editor_name: string | null;
}

export type ChatExpense =
  | {
      readonly kind: 'gone';
      /** Who deleted it, when known: `self` for the viewer, else their name (or null). */
      readonly removedBy: { readonly self: boolean; readonly name: string | null } | null;
    }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly row: ChatExpenseRow;
      readonly paidBySelf: boolean;
      /** People with a share above zero. */
      readonly ways: number;
      /** The message's own trip, which VIEW opens the expense in. */
      readonly tripId: string | null;
    };

export function useChatExpense(messageId: string, refId: string | null): ChatExpense {
  const params = refId === null ? null : [refId];
  const expense = useLiveRows<ChatExpenseRow>(CHAT_EXPENSE_SQL, params, TABLES);
  const shares = useLiveRows<{ computed_minor: number | string | null }>(
    CHAT_EXPENSE_SHARES_SQL,
    params,
    TABLES,
  );
  const removal = useLiveRows<RemovedRow>(CHAT_EXPENSE_REMOVED_SQL, params, EDIT_TABLES);
  const queuedDelete = useLiveRows<{ queued: number }>(CHAT_EXPENSE_QUEUED_DELETE_SQL, params, [
    'commands',
  ]);
  const trip = useExpenseTrip(messageId);
  const uid = useLiveRows<{ value: string }>(UID_SQL, [OWNER_UID_KEY], UID_TABLES).rows[0]?.value;
  const row = expense.rows[0];
  // The viewer's own delete shows at once, offline too, before the synced rows catch up.
  const deletedHere = queuedDelete.rows.length > 0;
  const removedBy: RemovedRow | undefined =
    removal.rows[0] ?? (deletedHere ? { editor_id: uid ?? null, editor_name: null } : undefined);
  const gone =
    deletedHere ||
    refId === null ||
    (row !== undefined && row.deleted_at !== null) ||
    (row === undefined && (removedBy !== undefined || trip.synced));
  if (gone) {
    return {
      kind: 'gone',
      removedBy:
        removedBy === undefined
          ? null
          : { self: removedBy.editor_id === uid, name: removedBy.editor_name ?? null },
    };
  }
  if (row === undefined) return { kind: 'loading' };
  return {
    kind: 'ready',
    row,
    paidBySelf: row.payer_id === uid,
    ways: shares.rows.filter((share) => minor(share.computed_minor) > 0n).length,
    tripId: trip.tripId,
  };
}
