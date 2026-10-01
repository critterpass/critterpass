/**
 * Money lab scenes for Balances (3i-1), the history, an expense, and adding one (3i-2), over the
 * Bali Six fixtures and the engine, with every handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { AddExpenseView } from '../add-expense/AddExpenseView';
import {
  draftReducer,
  newDraft,
  sharesByMember,
  type DraftAction,
  type ExpenseDraft,
} from '../add-expense/draft';
import { useAddLabels } from '../add-expense/labels';
import { previewDraft } from '../add-expense/preview';
import { MoneyLoading } from '../balances/BalancesScreen';
import { BalancesView } from '../balances/BalancesView';
import { buildBalances } from '../balances/model';
import { ExpenseDetailView } from '../expense-detail/ExpenseDetailView';
import { HistoryView } from '../history/HistoryView';
import { LAB_FX, LAB_HISTORY, LAB_LATEST, LAB_LEDGER, LAB_MEMBERS, LAB_UID } from './lab-fixtures';

const noop = () => undefined;

function balances(
  uid: string,
  options: { empty?: boolean; offline?: boolean; solo?: boolean; latest?: typeof LAB_LATEST } = {},
): ReactNode {
  const model = buildBalances({
    uid,
    members: options.solo === true ? LAB_MEMBERS.slice(0, 1) : LAB_MEMBERS,
    shown: options.solo === true ? LAB_MEMBERS.slice(0, 1) : LAB_MEMBERS,
    ledger: options.empty === true || options.solo === true ? [] : LAB_LEDGER,
    payments: [],
    expenses: [{ crew_amount_minor: 481_200, crew_currency: 'USD' }],
    currency: 'USD',
  });
  return (
    <BalancesView
      currency="USD"
      totalSpentMinor={options.empty === true ? 0n : model.totalSpentMinor}
      hero={model.hero}
      lines={model.lines}
      settleTaps={model.plan.length}
      latest={options.empty === true ? null : (options.latest ?? LAB_LATEST)}
      empty={options.empty === true}
      solo={options.solo === true}
      offline={options.offline === true}
      onCurrency={noop}
      onSettle={noop}
      onScan={noop}
      onAdd={noop}
      onBudget={noop}
      onHistory={noop}
      onExpense={noop}
    />
  );
}

const TYPE_450K: DraftAction[] = ['4', '5', '0', '000'].map((key) => ({
  type: 'key',
  key: key as '4',
}));

function AddScene({
  extra,
  currency = 'IDR',
}: {
  readonly extra: readonly DraftAction[];
  readonly currency?: string;
}) {
  const base = newDraft({
    currency,
    payerId: LAB_UID,
    memberIds: LAB_MEMBERS.map((member) => member.userId),
  });
  const draft: ExpenseDraft = [
    ...TYPE_450K,
    { type: 'suggest', category: 'food', description: 'Smoothie bowls, Clear Café' } as const,
    ...extra,
  ].reduce(draftReducer, base);
  const preview = previewDraft(draft, 'USD', LAB_FX);
  const labels = useAddLabels(draft, preview, 'USD', false);
  return (
    <AddExpenseView
      crewName="Bali Six"
      editing={false}
      draft={draft}
      members={LAB_MEMBERS}
      approx={labels.approx}
      perMember={sharesByMember(draft)}
      ctaLabel={labels.ctaLabel}
      ctaDisabled={false}
      shake={0}
      submitting={false}
      onKey={noop}
      onPayer={noop}
      onMode={noop}
      onToggle={noop}
      onStep={noop}
      onFocus={noop}
      onCurrency={noop}
      onDetails={noop}
      onScanInstead={noop}
      onSubmit={noop}
    />
  );
}

export const HOME_SCENES: Readonly<Record<string, () => ReactNode>> = {
  balances: () => balances(LAB_UID),
  'balances-owes': () => balances('u-alex'),
  'balances-square': () => balances('u-dev'),
  'balances-empty': () => balances(LAB_UID, { empty: true }),
  'balances-solo': () => balances(LAB_UID, { solo: true }),
  'balances-offline': () =>
    balances(LAB_UID, { offline: true, latest: LAB_HISTORY[0] ?? LAB_LATEST }),
  'balances-loading': () => <MoneyLoading />,
  history: () => (
    <HistoryView
      items={LAB_HISTORY}
      members={LAB_MEMBERS}
      crewCurrency="USD"
      filter={{ memberId: null, category: null }}
      onFilter={noop}
      onExpense={noop}
    />
  ),
  expense: () => (
    <ExpenseDetailView
      item={LAB_LATEST}
      crewCurrency="USD"
      fx={{ from: 'USD', to: 'IDR', rate: 15835, asOf: '2026-10-14' }}
      shares={LAB_MEMBERS.map((member) => ({
        userId: member.userId,
        name: member.name,
        crewMinor: member.name === 'Jordan' ? 150n : 1334n,
      }))}
      edits={[
        {
          id: 'x1',
          editorName: 'Maya',
          kind: 'edited',
          fields: ['amount', 'split'],
          at: '2026-10-14T06:00:00Z',
        },
      ]}
      canChange
      onEdit={noop}
      onDelete={noop}
    />
  ),
  add: () => <AddScene extra={[]} />,
  'add-paid-by-alex': () => <AddScene extra={[{ type: 'payer', userId: 'u-alex' }]} />,
  'add-by-share': () => (
    <AddScene
      extra={[
        { type: 'mode', mode: 'weights' },
        { type: 'weight', userId: LAB_UID, delta: 1 },
        { type: 'weight', userId: 'u-dev', delta: -1 },
      ]}
    />
  ),
  'add-custom': () => (
    <AddScene
      extra={[
        { type: 'mode', mode: 'fixed' },
        { type: 'focus', userId: LAB_UID },
        { type: 'key', key: '2' },
        { type: 'key', key: '000' },
        { type: 'key', key: '000' },
      ]}
    />
  ),
  // Dong: no minor units, and Vietnamese writes the symbol after the number.
  'add-dong': () => <AddScene currency="VND" extra={[{ type: 'key', key: '0' }]} />,
};
