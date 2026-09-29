/**
 * The expense being entered on the keypad, as a reducer plus the rules that decide what it splits
 * to and whether it may be added. Amounts are typed in display units (cents for USD, whole rupiah
 * for IDR) and stay exact integers; the engine allocates the shares:
 * - EVENLY: everyone included gets an equal share; the payer absorbs the odd unit.
 * - BY SHARE: per-member steppers weight the split; 0 leaves the member out.
 * - CUSTOM: per-member amounts that must add up to the total exactly ("left to assign").
 */
/* eslint-disable lingui/no-unlocalized-strings -- split modes and reasons are wire values, never copy. */
import {
  computeExpenseShares,
  currencyExponent,
  displayDecimals,
  isKnownCurrency,
  type Share,
} from '@cp/cost-engine';
import type { AddExpensePayload, ExpenseCategory } from '@cp/domain';

import type { KeypadKey } from '@/ui/inputs/Keypad';

export type SplitEditorMode = 'equal' | 'weights' | 'fixed';

/** The keypad writes at most this many characters into a field. */
export const MAX_AMOUNT_CHARS = 10;
export const MAX_WEIGHT = 20;

export interface ExpenseDraft {
  /** Display units as typed ("450000" for Rp 450.000, "2842" for $28.42). */
  readonly digits: string;
  readonly currency: string;
  readonly payerId: string;
  readonly mode: SplitEditorMode;
  /** Everyone the expense can be split between, in the order the crew sees them. */
  readonly memberIds: readonly string[];
  /** EVENLY: who is in. */
  readonly included: readonly string[];
  /** BY SHARE: each member's weight (missing = 1). */
  readonly weights: Readonly<Record<string, number>>;
  /** CUSTOM: each member's amount, typed like the total. */
  readonly fixed: Readonly<Record<string, string>>;
  /** Where the keypad types: the total, or a member's CUSTOM amount. */
  readonly focus: string | null;
  readonly category: ExpenseCategory;
  readonly categoryTouched: boolean;
  readonly description: string;
  /** When it was spent; null means now. */
  readonly spentAt: string | null;
}

export type DraftAction =
  | { readonly type: 'key'; readonly key: KeypadKey }
  | { readonly type: 'currency'; readonly currency: string }
  | { readonly type: 'payer'; readonly userId: string }
  | { readonly type: 'mode'; readonly mode: SplitEditorMode }
  | { readonly type: 'toggle'; readonly userId: string }
  | { readonly type: 'weight'; readonly userId: string; readonly delta: 1 | -1 }
  | { readonly type: 'focus'; readonly userId: string | null }
  | { readonly type: 'category'; readonly category: ExpenseCategory }
  | { readonly type: 'suggest'; readonly category: ExpenseCategory; readonly description: string }
  | { readonly type: 'description'; readonly text: string }
  | { readonly type: 'spentAt'; readonly at: string | null };

export function newDraft(input: {
  readonly currency: string;
  readonly payerId: string;
  readonly memberIds: readonly string[];
}): ExpenseDraft {
  return {
    digits: '',
    currency: input.currency,
    payerId: input.payerId,
    mode: 'equal',
    memberIds: input.memberIds,
    included: input.memberIds,
    weights: {},
    fixed: {},
    focus: null,
    category: 'other',
    categoryTouched: false,
    description: '',
    spentAt: null,
  };
}

/** One keypad press on a digit string: no leading zeros, at most `MAX_AMOUNT_CHARS`. */
export function pressKey(current: string, key: KeypadKey): string {
  if (key === 'delete') return current.slice(0, -1);
  if (current === '' && (key === '0' || key === '000')) return current;
  const next = current + key;
  return next.length > MAX_AMOUNT_CHARS ? current : next;
}

export function weightOf(draft: ExpenseDraft, userId: string): number {
  return draft.weights[userId] ?? 1;
}

export function draftReducer(draft: ExpenseDraft, action: DraftAction): ExpenseDraft {
  switch (action.type) {
    case 'key': {
      if (draft.mode === 'fixed' && draft.focus !== null) {
        const current = draft.fixed[draft.focus] ?? '';
        return {
          ...draft,
          fixed: { ...draft.fixed, [draft.focus]: pressKey(current, action.key) },
        };
      }
      return { ...draft, digits: pressKey(draft.digits, action.key) };
    }
    case 'currency':
      // Typed amounts are display units of the old currency; start the fields over.
      return action.currency === draft.currency
        ? draft
        : { ...draft, currency: action.currency, digits: '', fixed: {}, focus: null };
    case 'payer':
      return { ...draft, payerId: action.userId };
    case 'mode':
      return { ...draft, mode: action.mode, focus: null };
    case 'toggle': {
      const id = action.userId;
      if (draft.mode === 'weights') {
        return { ...draft, weights: { ...draft.weights, [id]: weightOf(draft, id) > 0 ? 0 : 1 } };
      }
      if (draft.mode === 'fixed') {
        return { ...draft, focus: draft.focus === id ? null : id };
      }
      const included = draft.included.includes(id)
        ? draft.included.filter((member) => member !== id)
        : draft.memberIds.filter((member) => member === id || draft.included.includes(member));
      return { ...draft, included };
    }
    case 'weight': {
      const next = Math.min(MAX_WEIGHT, Math.max(0, weightOf(draft, action.userId) + action.delta));
      return { ...draft, weights: { ...draft.weights, [action.userId]: next } };
    }
    case 'focus':
      return { ...draft, focus: action.userId };
    case 'category':
      return { ...draft, category: action.category, categoryTouched: true };
    case 'suggest':
      return draft.categoryTouched || draft.description !== ''
        ? draft
        : { ...draft, category: action.category, description: action.description };
    case 'description':
      return { ...draft, description: action.text };
    case 'spentAt':
      return { ...draft, spentAt: action.at };
  }
}

/** Display units → ISO minor units (IDR shows whole rupiah but stores sen). */
export function unitsToMinor(digits: string, currency: string): bigint {
  const units = BigInt(digits === '' ? '0' : digits);
  if (!isKnownCurrency(currency)) return units;
  return units * 10n ** BigInt(currencyExponent(currency) - displayDecimals(currency));
}

/** ISO minor units → the digits the keypad would have typed. */
export function minorToUnits(amountMinor: bigint, currency: string): string {
  if (amountMinor <= 0n) return '';
  if (!isKnownCurrency(currency)) return amountMinor.toString();
  const scale = 10n ** BigInt(currencyExponent(currency) - displayDecimals(currency));
  return (amountMinor / scale).toString();
}

export function amountMinorOf(draft: ExpenseDraft): bigint {
  return unitsToMinor(draft.digits, draft.currency);
}

export function fixedMinorOf(draft: ExpenseDraft, userId: string): bigint {
  return unitsToMinor(draft.fixed[userId] ?? '', draft.currency);
}

/** CUSTOM: the total less what has been assigned (negative when over). */
export function leftToAssign(draft: ExpenseDraft): bigint {
  const assigned = draft.memberIds.reduce((sum, id) => sum + fixedMinorOf(draft, id), 0n);
  return amountMinorOf(draft) - assigned;
}

export type DraftProblem = 'zero_amount' | 'nobody' | 'fixed_mismatch';

/** Why the draft cannot be added yet, or null when it can. */
export function draftProblem(draft: ExpenseDraft): DraftProblem | null {
  if (amountMinorOf(draft) <= 0n) return 'zero_amount';
  if (draft.mode === 'equal' && draft.included.length === 0) return 'nobody';
  if (draft.mode === 'weights' && draft.memberIds.every((id) => weightOf(draft, id) === 0)) {
    return 'nobody';
  }
  if (draft.mode === 'fixed' && leftToAssign(draft) !== 0n) return 'fixed_mismatch';
  return null;
}

/** The split members in the engine's shape. */
function splitMembers(draft: ExpenseDraft) {
  if (draft.mode === 'equal') return draft.included.map((userId) => ({ userId }));
  if (draft.mode === 'weights') {
    return draft.memberIds.map((userId) => ({ userId, weight: weightOf(draft, userId) }));
  }
  return draft.memberIds.map((userId) => ({ userId, fixedMinor: fixedMinorOf(draft, userId) }));
}

/** Each member's share in the expense currency, or null while the draft has a problem. */
export function draftShares(draft: ExpenseDraft): readonly Share[] | null {
  if (draftProblem(draft) !== null) return null;
  return computeExpenseShares({
    total: { amountMinor: amountMinorOf(draft), currency: draft.currency },
    mode: draft.mode,
    members: splitMembers(draft),
    payerId: draft.payerId,
  });
}

/** How many people the split counts (for "each"). */
export function headCount(draft: ExpenseDraft): number {
  if (draft.mode === 'equal') return draft.included.length;
  if (draft.mode === 'weights')
    return draft.memberIds.filter((id) => weightOf(draft, id) > 0).length;
  return draft.memberIds.filter((id) => fixedMinorOf(draft, id) > 0n).length;
}

/** The `add_expense` payload; null while the draft has a problem. */
export function toAddPayload(
  draft: ExpenseDraft,
  ids: {
    readonly expenseId: string;
    readonly tripId: string;
    readonly fxSnapshotId: string | null;
  },
): AddExpensePayload | null {
  if (draftProblem(draft) !== null) return null;
  const shares =
    draft.mode === 'equal'
      ? draft.included.map((user_id) => ({ user_id }))
      : draft.mode === 'weights'
        ? draft.memberIds.map((user_id) => ({ user_id, weight: weightOf(draft, user_id) }))
        : draft.memberIds.map((user_id) => ({
            user_id,
            fixed_minor: Number(fixedMinorOf(draft, user_id)),
          }));
  const description = draft.description.trim();
  return {
    expense_id: ids.expenseId,
    trip_id: ids.tripId,
    amount_minor: Number(amountMinorOf(draft)),
    currency: draft.currency,
    fx_snapshot_id: ids.fxSnapshotId,
    payer_uid: draft.payerId,
    split: { mode: draft.mode, shares },
    category: draft.category,
    description,
    ...(draft.spentAt === null ? {} : { spent_at: draft.spentAt }),
  };
}
