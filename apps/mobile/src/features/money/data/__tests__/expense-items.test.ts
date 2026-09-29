import { describe, expect, it } from '@jest/globals';

import type { MoneyMember } from '../context';
import { expenseItems, filterItems, groupByDay } from '../expense-items';
import type { ExpenseRow, PendingCommandRow, ShareRow } from '../queries';

const members: MoneyMember[] = [
  { userId: 'maya', name: 'Maya', joinIndex: 0, active: true },
  { userId: 'jordan', name: 'Jordan', joinIndex: 1, active: true },
  { userId: 'dev', name: 'Dev', joinIndex: 2, active: true },
];

const expense = (id: string, spentAt: string, extra: Partial<ExpenseRow> = {}): ExpenseRow => ({
  id,
  payer_id: 'maya',
  amount_minor: 108000000,
  currency: 'IDR',
  fx_snapshot_id: 'fx1',
  crew_amount_minor: 6820,
  crew_currency: 'USD',
  split_mode: 'equal',
  category: 'food',
  description: 'Babi guling, Ibu Oka',
  merchant: null,
  local_date: spentAt.slice(0, 10),
  trip_day: 1,
  spent_at: spentAt,
  receipt_id: null,
  source: 'manual',
  created_by: 'maya',
  version: 1,
  created_at: spentAt,
  ...extra,
});

const share = (expenseId: string, userId: string, computed: number): ShareRow => ({
  expense_id: expenseId,
  user_id: userId,
  weight: null,
  fixed_minor: null,
  computed_minor: computed,
  crew_computed_minor: computed,
  excluded_reason: computed === 0 ? 'left_out' : null,
});

const queued = (cmd: string, payload: object, id = `op-${cmd}`): PendingCommandRow => ({
  id,
  cmd,
  envelope: JSON.stringify({ payload }),
  status: 'queued',
  created_at: null,
});

const base = { members, tripId: 'trip', tz: 'Asia/Makassar', crewCurrency: 'USD' };

describe('expense items', () => {
  const expenses = [expense('e1', '2026-10-14T05:12:00Z'), expense('e2', '2026-10-13T11:00:00Z')];
  const shares = [share('e1', 'maya', 1), share('e1', 'jordan', 0), share('e2', 'dev', 5)];

  it('names who paid and who was left out', () => {
    const [first] = expenseItems({ ...base, expenses, shares, pending: [] });
    expect(first).toMatchObject({
      id: 'e1',
      payerName: 'Maya',
      leftOut: ['Jordan'],
      pending: null,
    });
    expect(first?.inSplit).toEqual(['maya']);
  });

  it('lists an expense still in the offline queue first, pending, without a crew amount yet', () => {
    const add = queued('add_expense', {
      expense_id: 'e3',
      trip_id: 'trip',
      amount_minor: 45000000,
      currency: 'IDR',
      payer_uid: 'jordan',
      split: {
        mode: 'weights',
        shares: [
          { user_id: 'jordan', weight: 1 },
          { user_id: 'dev', weight: 0 },
        ],
      },
      category: 'food',
      description: 'Smoothie bowls',
      spent_at: '2026-10-15T01:00:00Z',
    });
    const items = expenseItems({ ...base, expenses, shares, pending: [add] });
    expect(items[0]).toMatchObject({
      id: 'e3',
      pending: 'add',
      crewAmountMinor: null,
      leftOut: ['Dev'],
      shareCount: 1,
    });
  });

  it('drops a queued add once its expense has synced, and ignores other trips', () => {
    const payload = {
      expense_id: 'e1',
      trip_id: 'trip',
      amount_minor: 1,
      currency: 'USD',
      payer_uid: 'maya',
      split: { mode: 'equal', shares: [{ user_id: 'maya' }] },
      category: 'food',
      description: '',
    };
    const add = queued('add_expense', payload);
    const other = queued('add_expense', { ...payload, expense_id: 'x', trip_id: 'other' }, 'op2');
    expect(expenseItems({ ...base, expenses, shares, pending: [add, other] })).toHaveLength(2);
  });

  it('marks a synced expense with a queued delete or edit as pending', () => {
    const items = expenseItems({
      ...base,
      expenses,
      shares,
      pending: [
        queued('delete_expense', { expense_id: 'e2' }),
        queued('edit_expense', { expense_id: 'e1' }),
      ],
    });
    expect(items.map((item) => item.pending)).toEqual(['edit', 'delete']);
  });

  it('groups by local day and filters by member and category', () => {
    const items = expenseItems({ ...base, expenses, shares, pending: [] });
    expect(groupByDay(items).map((group) => group.localDate)).toEqual(['2026-10-14', '2026-10-13']);
    expect(filterItems(items, { memberId: 'dev', category: null }).map((i) => i.id)).toEqual([
      'e2',
    ]);
    expect(filterItems(items, { memberId: 'jordan', category: null })).toHaveLength(0);
    expect(filterItems(items, { memberId: null, category: 'stays' })).toHaveLength(0);
  });
});
