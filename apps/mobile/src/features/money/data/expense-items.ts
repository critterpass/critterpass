/**
 * Expense rows as the money lists show them: synced expenses plus the ones still waiting in the
 * offline queue (marked pending, so the list never loses an expense added on a plane). A queued
 * edit or delete marks its synced row pending too. Rows group by the trip-local day they were
 * spent on, newest first. A synced expense the server has not converted yet keeps a null crew
 * amount, so the row shows what was paid and never a made-up zero.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import type { AddExpensePayload, ExpenseCategory } from '@cp/domain';

import { memberName, type MoneyMember } from './context';
import { json, minor, type ExpenseRow, type PendingCommandRow, type ShareRow } from './queries';

export interface ExpenseItem {
  readonly id: string;
  readonly title: string;
  readonly category: ExpenseCategory;
  readonly payerId: string;
  readonly payerName: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  /** Crew-currency amount; null until the server has converted a foreign expense. */
  readonly crewAmountMinor: bigint | null;
  readonly localDate: string;
  readonly spentAt: string;
  /** Members left out of the split, by first name. */
  readonly leftOut: readonly string[];
  readonly shareCount: number;
  /** Members with a share of it. */
  readonly inSplit: readonly string[];
  readonly pending: 'add' | 'edit' | 'delete' | null;
  readonly fromReceipt: boolean;
}

const CATEGORIES = new Set<string>(['stays', 'food', 'transit', 'fun', 'other']);

export function categoryOf(value: string | null | undefined): ExpenseCategory {
  return value !== null && value !== undefined && CATEGORIES.has(value)
    ? (value as ExpenseCategory)
    : 'other';
}

interface Envelope<P> {
  readonly payload: P;
}

/** The expense id each queued money command touches, with what it does. */
function queuedTouches(pending: readonly PendingCommandRow[]): Map<string, 'edit' | 'delete'> {
  const touched = new Map<string, 'edit' | 'delete'>();
  for (const row of pending) {
    if (row.cmd !== 'edit_expense' && row.cmd !== 'delete_expense') continue;
    const id = json<Envelope<{ expense_id?: string }> | null>(row.envelope, null)?.payload
      .expense_id;
    if (id !== undefined) touched.set(id, row.cmd === 'delete_expense' ? 'delete' : 'edit');
  }
  return touched;
}

/** Queued `add_expense` payloads whose expense has not synced yet. */
export function queuedAdds(
  pending: readonly PendingCommandRow[],
  syncedIds: ReadonlySet<string>,
): AddExpensePayload[] {
  return pending
    .filter((row) => row.cmd === 'add_expense')
    .map((row) => json<Envelope<AddExpensePayload> | null>(row.envelope, null)?.payload)
    .filter((payload): payload is AddExpensePayload => payload !== undefined)
    .filter((payload) => !syncedIds.has(payload.expense_id));
}

function localDateOf(iso: string, tz: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz ?? undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** Each expense's shares, grouped once (a trip has hundreds of rows; no scan per expense). */
export function sharesByExpense(shares: readonly ShareRow[]): Map<string, ShareRow[]> {
  const byExpense = new Map<string, ShareRow[]>();
  for (const share of shares) {
    const list = byExpense.get(share.expense_id);
    if (list === undefined) byExpense.set(share.expense_id, [share]);
    else list.push(share);
  }
  return byExpense;
}

export function expenseItems(input: {
  readonly expenses: readonly ExpenseRow[];
  readonly shares: readonly ShareRow[];
  readonly pending: readonly PendingCommandRow[];
  readonly members: readonly MoneyMember[];
  readonly tripId: string;
  readonly tz: string | null;
  readonly crewCurrency: string;
}): ExpenseItem[] {
  const touched = queuedTouches(input.pending);
  const byExpense = sharesByExpense(input.shares);
  const synced: ExpenseItem[] = input.expenses.map((row) => {
    const shares = byExpense.get(row.id) ?? [];
    const spentAt = row.spent_at ?? row.created_at ?? '';
    return {
      id: row.id,
      title: row.description || row.merchant || '',
      category: categoryOf(row.category),
      payerId: row.payer_id,
      payerName: memberName(input.members, row.payer_id),
      amountMinor: minor(row.amount_minor),
      currency: row.currency,
      crewAmountMinor: row.crew_amount_minor === null ? null : minor(row.crew_amount_minor),
      localDate: row.local_date ?? localDateOf(spentAt, input.tz),
      spentAt,
      leftOut: shares
        .filter((share) => minor(share.computed_minor) === 0n)
        .map((share) => memberName(input.members, share.user_id))
        .filter((name) => name !== ''),
      shareCount: shares.filter((share) => minor(share.computed_minor) > 0n).length,
      inSplit: shares
        .filter((share) => minor(share.computed_minor) > 0n)
        .map((share) => share.user_id),
      pending: touched.get(row.id) ?? null,
      fromReceipt: row.receipt_id !== null,
    };
  });
  const ids = new Set(input.expenses.map((row) => row.id));
  const queued: ExpenseItem[] = queuedAdds(input.pending, ids)
    .filter((payload) => payload.trip_id === input.tripId)
    .map((payload) => {
      const spentAt = payload.spent_at ?? new Date().toISOString();
      const inSplit = payload.split.shares.filter(
        (share) =>
          payload.split.mode === 'equal' ||
          (payload.split.mode === 'weights'
            ? (share.weight ?? 0) > 0
            : (share.fixed_minor ?? 0) > 0),
      );
      return {
        id: payload.expense_id,
        title: payload.description || payload.merchant || '',
        category: payload.category,
        payerId: payload.payer_uid,
        payerName: memberName(input.members, payload.payer_uid),
        amountMinor: BigInt(payload.amount_minor),
        currency: payload.currency,
        crewAmountMinor:
          payload.currency === input.crewCurrency ? BigInt(payload.amount_minor) : null,
        localDate: localDateOf(spentAt, input.tz),
        spentAt,
        leftOut: payload.split.shares
          .filter((share) => !inSplit.includes(share))
          .map((share) => memberName(input.members, share.user_id))
          .filter((name) => name !== ''),
        shareCount: inSplit.length,
        inSplit: inSplit.map((share) => share.user_id),
        pending: 'add',
        fromReceipt: false,
      };
    });
  return [...queued, ...synced].sort((a, b) => b.spentAt.localeCompare(a.spentAt));
}

export interface DayGroup {
  readonly localDate: string;
  readonly items: readonly ExpenseItem[];
}

/** Items grouped by local day, keeping the newest-first order. */
export function groupByDay(items: readonly ExpenseItem[]): DayGroup[] {
  const groups: { localDate: string; items: ExpenseItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last?.localDate === item.localDate) last.items.push(item);
    else groups.push({ localDate: item.localDate, items: [item] });
  }
  return groups;
}

export interface ExpenseFilter {
  readonly memberId: string | null;
  readonly category: ExpenseCategory | null;
}

/** Expenses a member paid or has a share of, in a category (either filter may be off). */
export function filterItems(items: readonly ExpenseItem[], filter: ExpenseFilter): ExpenseItem[] {
  return items.filter(
    (item) =>
      (filter.category === null || item.category === filter.category) &&
      (filter.memberId === null ||
        item.payerId === filter.memberId ||
        item.inSplit.includes(filter.memberId)),
  );
}
