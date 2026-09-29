/**
 * The add/edit expense screen's state: the draft reducer seeded from the trip (payer = you, split
 * between the trip's members, the trip's local currency), the FX run on the device for the live
 * "≈" line, a category suggestion from the plan, and submit through the offline command queue.
 */
import { generateUuidV7 } from '@cp/domain';
import { useCallback, useMemo, useState } from 'react';

import type { SendResult } from '@/data/commands/client';
import { useCommand } from '@/data/commands/use-command';

import { addExpenseCommand, editExpenseCommand } from '../data/commands';
import { useLiveRows } from '../data/live-rows';
import {
  FX_RUN_SQL,
  FX_TABLES,
  PLAN_ITEMS_SQL,
  PLAN_ITEMS_TABLES,
  type FxRow,
  type PlanItemRow,
} from '../data/queries';
import { useSelectedTrip } from '../data/selected-trip';
import { useMoneyContext, type MoneyContext } from '../data/use-money-context';
import { useTripMoney } from '../data/use-trip-money';
import { draftReducer, newDraft, toAddPayload, type DraftAction, type ExpenseDraft } from './draft';
import {
  draftFromExpense,
  fxContextOf,
  previewDraft,
  toEditPayload,
  type DraftPreview,
} from './preview';
import { suggestFromPlan } from './suggest';

export interface ExpenseDraftState {
  readonly ctx: MoneyContext;
  readonly ready: boolean;
  readonly draft: ExpenseDraft;
  readonly dispatch: (action: DraftAction) => void;
  readonly preview: DraftPreview | null;
  readonly crewCurrency: string;
  /** Currencies to offer: the trip's local one, the crew's, your home one, then recent ones. */
  readonly currencies: readonly string[];
  readonly editing: boolean;
  readonly submit: () => Promise<SendResult | null>;
  readonly pending: boolean;
}

const EMPTY = newDraft({ currency: 'USD', payerId: '', memberIds: [] });

export function useExpenseDraft(editId: string | null): ExpenseDraftState {
  const ctx = useMoneyContext(useSelectedTrip());
  const rows = useTripMoney(ctx.crew?.id ?? null, ctx.trip?.id ?? null);
  const crewCurrency = ctx.crew?.settlementCurrency ?? 'USD';
  const add = useCommand(addExpenseCommand);
  const edit = useCommand(editExpenseCommand);
  const editRow = editId === null ? null : (rows.expenses.find((row) => row.id === editId) ?? null);
  const ready = ctx.status === 'ready' && ctx.uid !== null && rows.loaded;
  const plan = useLiveRows<PlanItemRow>(
    PLAN_ITEMS_SQL,
    ctx.trip?.versionId == null || editId !== null ? null : [ctx.trip.id, ctx.trip.versionId],
    PLAN_ITEMS_TABLES,
  );

  // The starting draft: the expense being edited, or a new one for the trip (payer = you, split
  // between the trip's members, its local currency, named after the plan item under way).
  const seed = useMemo((): ExpenseDraft | null => {
    if (!ready || ctx.uid === null || ctx.trip === null) return null;
    const memberIds = ctx.splitMembers.map((member) => member.userId);
    if (editId !== null) {
      return editRow === null ? null : draftFromExpense(editRow, rows.shares, memberIds);
    }
    const fresh = newDraft({
      currency: ctx.trip.localCurrency ?? crewCurrency,
      payerId: ctx.uid,
      memberIds: memberIds.includes(ctx.uid) ? memberIds : [ctx.uid, ...memberIds],
    });
    const suggestion = suggestFromPlan(plan.rows, new Date());
    return suggestion === null ? fresh : draftReducer(fresh, { type: 'suggest', ...suggestion });
  }, [ready, ctx, editId, editRow, rows.shares, crewCurrency, plan.rows]);

  // The member's changes; until the first one the draft follows the seed.
  const [changed, setChanged] = useState<ExpenseDraft | null>(null);
  const draft = changed ?? seed ?? EMPTY;
  const dispatch = useCallback(
    (action: DraftAction) =>
      setChanged((current) => draftReducer(current ?? seed ?? EMPTY, action)),
    [seed],
  );

  const fxRows = useLiveRows<FxRow>(
    FX_RUN_SQL,
    draft.currency === crewCurrency ? null : [draft.currency, crewCurrency],
    FX_TABLES,
  );
  const fx = useMemo(() => fxContextOf(fxRows.rows, draft.currency), [fxRows.rows, draft.currency]);
  const preview = useMemo(() => previewDraft(draft, crewCurrency, fx), [draft, crewCurrency, fx]);

  const currencies = useMemo(() => {
    const recent = rows.expenses.map((row) => row.currency);
    return [
      ...new Set(
        [ctx.trip?.localCurrency, crewCurrency, ctx.homeCurrency, draft.currency, ...recent].filter(
          (value): value is string => typeof value === 'string' && value !== '',
        ),
      ),
    ];
  }, [rows.expenses, ctx.trip, ctx.homeCurrency, crewCurrency, draft.currency]);

  async function submit(): Promise<SendResult | null> {
    if (ctx.trip === null) return null;
    const fxSnapshotId = draft.currency === crewCurrency ? null : (fx?.snapshotId ?? null);
    if (editId !== null && editRow !== null && seed !== null) {
      const payload = toEditPayload(draft, seed, editRow, fxSnapshotId);
      if (payload === null) return null;
      return edit.send(
        payload,
        editRow.version === null ? undefined : { baseVersion: editRow.version },
      );
    }
    const payload = toAddPayload(draft, {
      expenseId: generateUuidV7(),
      tripId: ctx.trip.id,
      fxSnapshotId,
    });
    return payload === null ? null : add.send(payload);
  }

  return {
    ctx,
    ready: seed !== null,
    draft,
    dispatch,
    preview,
    crewCurrency,
    currencies,
    editing: editId !== null,
    submit,
    pending: add.pending || edit.pending,
  };
}
