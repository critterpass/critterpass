/**
 * Money writes the server refused after the app had already moved on. Adding, editing and deleting
 * an expense, and marking a payment paid, are answered at once on the phone and sent from the
 * queue; when the server says no, the queue rolls the write back and lists the refusal. This reads
 * that list for Money's commands and puts each refusal into words: what was not saved, and why.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, command names and wire values, never copy. */
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import { errorMessage } from '@/lib/errors/error-messages';

import { json } from './queries';

/**
 * `waited_offline`: the write waited with no signal, so the trip's "didn't go through" list holds
 * it until it is read there (that list marks such writes `offline_send` in `local_private`).
 */
export const REFUSED_MONEY_SQL = `SELECT r.id, r.cmd, r.code, r.detail,
    EXISTS (SELECT 1 FROM local_private p WHERE p.kind = 'offline_send' AND p.id = r.id)
      AS waited_offline
  FROM rejected_commands r
  WHERE r.cmd IN ('add_expense', 'edit_expense', 'delete_expense', 'mark_paid')
  ORDER BY r.rejected_at, r.id`;
export const REFUSED_MONEY_TABLES = ['rejected_commands', 'local_private'];

export interface RefusedMoneyRow {
  readonly id: string;
  readonly cmd: string;
  readonly code: string;
  readonly detail: string | null;
  readonly waited_offline: number | null;
}

export interface RefusedMoneyWrite {
  readonly opId: string;
  /** What was not saved ("Your expense wasn't added"). */
  readonly title: MessageDescriptor;
  /** Why, from the server's answer. */
  readonly reason: MessageDescriptor;
  /** The trip's "didn't go through" list keeps it; Money only says it once. */
  readonly keptForTrip: boolean;
}

const TITLES: Readonly<Record<string, MessageDescriptor>> = {
  add_expense: msg({ id: 'money.refused.addExpense', message: "Your expense wasn't added" }),
  edit_expense: msg({ id: 'money.refused.editExpense', message: "Your expense edit wasn't saved" }),
  delete_expense: msg({ id: 'money.refused.deleteExpense', message: "The expense wasn't deleted" }),
  mark_paid: msg({ id: 'money.refused.markPaid', message: "The payment wasn't marked paid" }),
};
const FALLBACK_TITLE = msg({ id: 'money.refused.other', message: "That didn't go through" });

const SOMEONE_LEFT = msg({
  id: 'money.refused.someoneLeft',
  message: 'Someone in it is no longer on this trip. Add it again without them.',
});
const YOU_LEFT = msg({
  id: 'money.refused.youLeft',
  message: "You're no longer on this trip.",
});

/** The line for the server's answer: Money's own for a split that names someone gone, else the code's. */
export function refusalReason(code: string, detail: string | null): MessageDescriptor {
  const reason = json<{ reason?: unknown } | null>(detail, null)?.reason;
  if (reason === 'not_in_trip') return code === 'VALIDATION' ? SOMEONE_LEFT : YOU_LEFT;
  return errorMessage(code);
}

export function toRefusedMoneyWrite(row: RefusedMoneyRow): RefusedMoneyWrite {
  return {
    opId: row.id,
    title: TITLES[row.cmd] ?? FALLBACK_TITLE,
    reason: refusalReason(row.code, row.detail),
    keptForTrip: row.waited_offline === 1,
  };
}
