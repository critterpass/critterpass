import { describe, expect, it } from '@jest/globals';

import type { MoneyMember } from '../../data/context';
import type { LedgerRow, PaymentRow } from '../../data/queries';
import { buildBalances } from '../model';

const ids = ['you', 'maya', 'alex', 'jordan', 'rin', 'dev'] as const;
const members: MoneyMember[] = ['You', 'Maya', 'Alex', 'Jordan', 'Rin', 'Dev'].map((name, i) => ({
  userId: ids[i] ?? '',
  name,
  joinIndex: i,
  active: true,
}));

const entry = (debtor: string, creditor: string, amount: number): LedgerRow => ({
  debtor_id: debtor,
  creditor_id: creditor,
  amount_minor: amount,
  currency: 'USD',
});

// The design's nets: You +186.40, Maya +41.00, Dev 0, Rin −41.00, Jordan −92.10, Alex −94.30.
const ledger = [
  entry('jordan', 'you', 9210),
  entry('alex', 'you', 9430),
  entry('rin', 'maya', 4100),
];

function payment(partial: Partial<PaymentRow> & Pick<PaymentRow, 'id' | 'status'>): PaymentRow {
  return {
    from_id: 'jordan',
    to_id: 'you',
    amount_minor: 9210,
    currency: 'USD',
    method: null,
    requested_at: null,
    last_nudged_at: null,
    marked_at: null,
    confirmed_at: null,
    auto_confirmed: 0,
    disputed_at: null,
    dispute_note: null,
    reissued_from_id: null,
    version: 1,
    updated_at: null,
    ...partial,
  };
}

const base = { uid: 'you', members, shown: members, payments: [], expenses: [], currency: 'USD' };

describe('balances model', () => {
  it('shows the design nets, you first, then most owed to most owing', () => {
    const model = buildBalances({ ...base, ledger });
    expect(model.lines.map((line) => [line.name, line.netMinor])).toEqual([
      ['You', 18640n],
      ['Maya', 4100n],
      ['Dev', 0n],
      ['Rin', -4100n],
      ['Jordan', -9210n],
      ['Alex', -9430n],
    ]);
    expect(model.hero).toEqual({ kind: 'owed', amountMinor: 18640n });
  });

  it('normalises bar lengths per side against that side’s largest balance', () => {
    const model = buildBalances({ ...base, ledger });
    const fraction = (name: string) => model.lines.find((line) => line.name === name)?.fraction;
    expect(fraction('You')).toBe(1);
    expect(fraction('Maya')).toBe(0.219);
    expect(fraction('Alex')).toBe(1);
    expect(fraction('Rin')).toBe(0.434);
    expect(fraction('Dev')).toBe(0);
  });

  it('settles the design nets in three taps', () => {
    expect(buildBalances({ ...base, ledger }).plan).toHaveLength(3);
  });

  it('counts a payment marked paid as made, so the plan shrinks before it is confirmed', () => {
    const model = buildBalances({
      ...base,
      ledger,
      payments: [payment({ id: 'p1', status: 'marked_paid' })],
    });
    expect(model.plan).toHaveLength(2);
    expect(model.openPayments).toBe(1);
    // The ledger (and so the hero) only moves once the payee confirms.
    expect(model.hero.amountMinor).toBe(18640n);
  });

  it('reads a debtor as "you owe" and an empty ledger as all square', () => {
    expect(buildBalances({ ...base, uid: 'alex', ledger }).hero).toEqual({
      kind: 'owes',
      amountMinor: 9430n,
    });
    const empty = buildBalances({ ...base, ledger: [] });
    expect(empty.hero).toEqual({ kind: 'square', amountMinor: 0n });
    expect(empty.plan).toEqual([]);
  });

  it('keeps a former member who is still in the ledger', () => {
    const shown = members.filter((member) => member.userId !== 'rin');
    const model = buildBalances({ ...base, shown, ledger });
    expect(model.lines.some((line) => line.userId === 'rin')).toBe(true);
  });

  it('sums total spend from expenses already in the crew currency', () => {
    const model = buildBalances({
      ...base,
      ledger,
      expenses: [
        { crew_amount_minor: 6820, crew_currency: 'USD' },
        { crew_amount_minor: 2842, crew_currency: 'USD' },
        { crew_amount_minor: 999, crew_currency: 'SGD' },
      ],
    });
    expect(model.totalSpentMinor).toBe(9662n);
  });
});
