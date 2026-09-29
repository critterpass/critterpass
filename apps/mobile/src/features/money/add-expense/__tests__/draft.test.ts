import { describe, expect, it } from '@jest/globals';

import type { KeypadKey } from '@/ui/inputs/Keypad';

import type { ExpenseRow, FxRow, ShareRow } from '../../data/queries';
import {
  draftProblem,
  draftReducer,
  draftShares,
  leftToAssign,
  newDraft,
  toAddPayload,
  unitsToMinor,
  type DraftAction,
  type ExpenseDraft,
} from '../draft';
import { draftFromExpense, fxContextOf, previewDraft, toEditPayload } from '../preview';

const crew = ['w', 'm', 'a', 'j', 'r', 'd'];
const run = (draft: ExpenseDraft, ...actions: DraftAction[]) => actions.reduce(draftReducer, draft);
const keys = (...pressed: KeypadKey[]): DraftAction[] =>
  pressed.map((key) => ({ type: 'key', key }));
const idr = () => newDraft({ currency: 'IDR', payerId: 'w', memberIds: crew });
const fxRows: FxRow[] = [
  {
    id: 'fx-usd-idr',
    base: 'USD',
    quote: 'IDR',
    rate: '15835',
    as_of: '2026-10-14',
    source: 'ecb',
  },
];

describe('keypad entry', () => {
  it('types in display units and stores exact minor units (rupiah in sen, dollars in cents)', () => {
    const draft = run(idr(), ...keys('4', '5', '0', '000'));
    expect(draft.digits).toBe('450000');
    expect(unitsToMinor(draft.digits, 'IDR')).toBe(45_000_000n);
    expect(unitsToMinor('2842', 'USD')).toBe(2842n);
    expect(unitsToMinor('1500', 'JPY')).toBe(1500n);
  });

  it('ignores leading zeros, deletes the last digit and stops at ten characters', () => {
    expect(run(idr(), ...keys('0', '000', '7', 'delete')).digits).toBe('');
    expect(
      run(idr(), ...keys('9', '9', '9', '9', '9', '9', '9', '9', '9', '9', '9')).digits,
    ).toHaveLength(10);
  });

  it('cannot be added at zero', () => {
    expect(draftProblem(idr())).toBe('zero_amount');
  });
});

describe('EVENLY', () => {
  it('shows Rp 450.000 across six as ≈ $28.42 · $4.74 each', () => {
    const draft = run(idr(), ...keys('4', '5', '0', '000'));
    const preview = previewDraft(draft, 'USD', fxContextOf(fxRows, 'IDR'));
    expect(preview).toMatchObject({ crewTotalMinor: 2842n, eachMinor: 474n, converted: true });
  });

  it('leaves out a member tapped off, and blocks a split with nobody in it', () => {
    let draft = run(idr(), ...keys('6', '0', '0', '0'), { type: 'toggle', userId: 'j' });
    expect(draftShares(draft)?.map((share) => share.userId)).toEqual(['w', 'm', 'a', 'r', 'd']);
    draft = run(draft, { type: 'toggle', userId: 'j' });
    expect(draft.included).toEqual(crew);
    for (const id of crew) draft = run(draft, { type: 'toggle', userId: id });
    expect(draftProblem(draft)).toBe('nobody');
  });

  it('gives the odd unit to the payer', () => {
    const draft = run(
      newDraft({ currency: 'USD', payerId: 'm', memberIds: ['w', 'm', 'a'] }),
      ...keys('1', '0', '0'),
    );
    expect(draftShares(draft)?.map((share) => share.amountMinor)).toEqual([33n, 34n, 33n]);
  });
});

describe('BY SHARE', () => {
  it('weights the split, and a stepper at zero leaves the member out', () => {
    const usd = newDraft({ currency: 'USD', payerId: 'w', memberIds: ['w', 'm', 'a'] });
    const draft = run(
      usd,
      ...keys('9', '0', '0'),
      { type: 'mode', mode: 'weights' },
      { type: 'weight', userId: 'w', delta: 1 },
      { type: 'weight', userId: 'a', delta: -1 },
    );
    expect(draftShares(draft)?.map((share) => share.amountMinor)).toEqual([600n, 300n, 0n]);
    expect(toAddPayload(draft, { expenseId: 'e', tripId: 't', fxSnapshotId: null })?.split).toEqual(
      {
        mode: 'weights',
        shares: [
          { user_id: 'w', weight: 2 },
          { user_id: 'm', weight: 1 },
          { user_id: 'a', weight: 0 },
        ],
      },
    );
  });

  it('cannot go below zero and blocks when everyone is at zero', () => {
    let draft = run(newDraft({ currency: 'USD', payerId: 'w', memberIds: ['w'] }), ...keys('5'), {
      type: 'mode',
      mode: 'weights',
    });
    draft = run(
      draft,
      { type: 'weight', userId: 'w', delta: -1 },
      { type: 'weight', userId: 'w', delta: -1 },
    );
    expect(draft.weights['w']).toBe(0);
    expect(draftProblem(draft)).toBe('nobody');
  });
});

describe('CUSTOM', () => {
  const usd = () =>
    run(
      newDraft({ currency: 'USD', payerId: 'w', memberIds: ['w', 'm'] }),
      ...keys('1', '0', '0', '0'),
      { type: 'mode', mode: 'fixed' },
    );

  it('types into the focused member and tracks what is left to assign', () => {
    const draft = run(usd(), { type: 'toggle', userId: 'w' }, ...keys('6', '0', '0'));
    expect(draft.digits).toBe('1000');
    expect(draft.fixed['w']).toBe('600');
    expect(leftToAssign(draft)).toBe(400n);
    expect(draftProblem(draft)).toBe('fixed_mismatch');
    expect(toAddPayload(draft, { expenseId: 'e', tripId: 't', fxSnapshotId: null })).toBeNull();
  });

  it('can be added once the amounts add up exactly, and not when they go over', () => {
    const exact = run(
      usd(),
      { type: 'focus', userId: 'w' },
      ...keys('6', '0', '0'),
      { type: 'focus', userId: 'm' },
      ...keys('4', '0', '0'),
    );
    expect(draftProblem(exact)).toBeNull();
    expect(draftShares(exact)?.map((share) => share.amountMinor)).toEqual([600n, 400n]);
    const over = run(exact, ...keys('0'));
    expect(leftToAssign(over)).toBe(-3600n);
    expect(draftProblem(over)).toBe('fixed_mismatch');
  });
});

describe('edits', () => {
  const row: ExpenseRow = {
    id: 'e1',
    payer_id: 'w',
    amount_minor: 45000000,
    currency: 'IDR',
    fx_snapshot_id: 'fx-usd-idr',
    crew_amount_minor: 2842,
    crew_currency: 'USD',
    split_mode: 'equal',
    category: 'food',
    description: 'Smoothie bowls',
    merchant: null,
    local_date: '2026-10-14',
    trip_day: 5,
    spent_at: '2026-10-14T01:00:00Z',
    receipt_id: null,
    source: 'manual',
    created_by: 'w',
    version: 3,
    created_at: null,
  };
  const shares: ShareRow[] = crew.map((user_id) => ({
    expense_id: 'e1',
    user_id,
    weight: null,
    fixed_minor: null,
    computed_minor: 7500000,
    crew_computed_minor: 474,
    excluded_reason: null,
  }));

  it('rebuilds the draft from the expense and sends only what changed', () => {
    const original = draftFromExpense(row, shares, crew);
    expect(original.digits).toBe('450000');
    expect(toEditPayload(original, original, row, 'fx-usd-idr')).toBeNull();
    const paidByMaya = run(original, { type: 'payer', userId: 'm' });
    expect(toEditPayload(paidByMaya, original, row, 'fx-usd-idr')).toEqual({
      expense_id: 'e1',
      base_version: 3,
      patch: { payer_uid: 'm' },
    });
  });
});
