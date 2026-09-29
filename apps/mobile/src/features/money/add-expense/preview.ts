/**
 * What the draft comes to in the crew currency while typing ("≈ $28.42 · $4.74 each"), converted
 * exactly as the server will: the whole total once with the newest FX run on the device, then the
 * crew total allocated by the expense-currency shares. Also the edit patch for an existing expense.
 */
import { perHeadMinor, toCrewShares, type FxContext, type FxSnapshot } from '@cp/cost-engine';
import type { EditExpensePayload } from '@cp/domain';

import { minor, type ExpenseRow, type FxRow, type ShareRow } from '../data/queries';
import { categoryOf } from '../data/expense-items';
import {
  amountMinorOf,
  draftShares,
  headCount,
  minorToUnits,
  newDraft,
  toAddPayload,
  type ExpenseDraft,
} from './draft';

/** The FX run rows as the engine's context; the id is the one the server stores on the expense. */
export function fxContextOf(rows: readonly FxRow[], from: string): FxContext | null {
  if (rows.length === 0) return null;
  const pinned = rows.find((row) => row.base === from || row.quote === from) ?? rows[0];
  if (pinned === undefined) return null;
  const snapshots: FxSnapshot[] = rows.map((row) => ({
    base: row.base,
    quote: row.quote,
    rate: String(row.rate),
    asOf: row.as_of,
    source: row.source,
  }));
  return { snapshotId: pinned.id, snapshots };
}

export interface DraftPreview {
  readonly crewTotalMinor: bigint;
  /** Per head on an even split; null for BY SHARE and CUSTOM (each row shows its own). */
  readonly eachMinor: bigint | null;
  /** Each member's crew-currency share. */
  readonly perMember: ReadonlyMap<string, bigint>;
  /** False when the currency needs a rate the device does not have yet. */
  readonly converted: boolean;
}

export function previewDraft(
  draft: ExpenseDraft,
  crewCurrency: string,
  fx: FxContext | null,
): DraftPreview | null {
  const shares = draftShares(draft);
  if (shares === null) return null;
  const total = { amountMinor: amountMinorOf(draft), currency: draft.currency };
  if (draft.currency !== crewCurrency && fx === null) {
    return {
      crewTotalMinor: total.amountMinor,
      eachMinor: null,
      perMember: new Map(shares.map((share) => [share.userId, share.amountMinor])),
      converted: false,
    };
  }
  try {
    const crew = toCrewShares(total, shares, crewCurrency, fx ?? undefined, draft.payerId);
    const heads = headCount(draft);
    return {
      crewTotalMinor: crew.total.amountMinor,
      eachMinor:
        draft.mode === 'equal' && heads > 0 ? perHeadMinor(crew.total.amountMinor, heads) : null,
      perMember: new Map(crew.shares.map((share) => [share.userId, share.amountMinor])),
      converted: true,
    };
  } catch {
    // The run on the device does not relate the two currencies.
    return {
      crewTotalMinor: total.amountMinor,
      eachMinor: null,
      perMember: new Map(shares.map((share) => [share.userId, share.amountMinor])),
      converted: false,
    };
  }
}

/** An existing expense back in the keypad's shape, for edit mode. */
export function draftFromExpense(
  row: ExpenseRow,
  shares: readonly ShareRow[],
  memberIds: readonly string[],
): ExpenseDraft {
  const mine = shares.filter((share) => share.expense_id === row.id);
  const ids = [
    ...memberIds,
    ...mine.map((share) => share.user_id).filter((id) => !memberIds.includes(id)),
  ];
  const base = newDraft({ currency: row.currency, payerId: row.payer_id, memberIds: ids });
  const mode =
    row.split_mode === 'weights' || row.split_mode === 'fixed' ? row.split_mode : 'equal';
  return {
    ...base,
    digits: minorToUnits(minor(row.amount_minor), row.currency),
    mode,
    included: ids.filter((id) =>
      mine.some((share) => share.user_id === id && minor(share.computed_minor) > 0n),
    ),
    weights: Object.fromEntries(
      ids.map((id) => [id, mine.find((share) => share.user_id === id)?.weight ?? 0]),
    ),
    fixed: Object.fromEntries(
      ids.map((id) => [
        id,
        minorToUnits(minor(mine.find((share) => share.user_id === id)?.fixed_minor), row.currency),
      ]),
    ),
    category: categoryOf(row.category),
    categoryTouched: true,
    description: row.description ?? row.merchant ?? '',
    spentAt: row.spent_at,
  };
}

/** The `edit_expense` patch: only what changed, or null when nothing did (or the draft is invalid). */
export function toEditPayload(
  draft: ExpenseDraft,
  original: ExpenseDraft,
  row: Pick<ExpenseRow, 'id' | 'version' | 'fx_snapshot_id'>,
  fxSnapshotId: string | null,
): EditExpensePayload | null {
  const next = toAddPayload(draft, { expenseId: row.id, tripId: '', fxSnapshotId });
  const before = toAddPayload(original, {
    expenseId: row.id,
    tripId: '',
    fxSnapshotId: row.fx_snapshot_id,
  });
  if (next === null || before === null) return null;
  const patch: Record<string, unknown> = {};
  if (next.amount_minor !== before.amount_minor) patch['amount_minor'] = next.amount_minor;
  if (next.currency !== before.currency) {
    patch['currency'] = next.currency;
    patch['fx_snapshot_id'] = fxSnapshotId;
  }
  if (next.payer_uid !== before.payer_uid) patch['payer_uid'] = next.payer_uid;
  if (JSON.stringify(next.split) !== JSON.stringify(before.split)) patch['split'] = next.split;
  if (next.category !== before.category) patch['category'] = next.category;
  if (next.description !== before.description) patch['description'] = next.description;
  if (next.spent_at !== before.spent_at && next.spent_at !== undefined)
    patch['spent_at'] = next.spent_at;
  if (Object.keys(patch).length === 0) return null;
  return {
    expense_id: row.id,
    ...(row.version === null ? {} : { base_version: row.version }),
    patch,
  };
}
