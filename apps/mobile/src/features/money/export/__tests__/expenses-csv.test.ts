import { describe, expect, it } from '@jest/globals';

import type { ExpenseItem } from '../../data/expense-items';
import type { ShareRow } from '../../data/queries';
import { csvCell, decimalOf, expensesCsv } from '../expenses-csv';

const item = (fields: Partial<ExpenseItem> & Pick<ExpenseItem, 'id'>): ExpenseItem => ({
  title: 'Lunch',
  category: 'food',
  payerId: 'u-maya',
  payerName: 'Maya',
  amountMinor: 45_000_000n,
  currency: 'IDR',
  crewAmountMinor: 2_880n,
  localDate: '2026-10-12',
  spentAt: '2026-10-12T05:00:00Z',
  leftOut: [],
  shareCount: 2,
  inSplit: ['u-maya', 'u-jo'],
  pending: null,
  fromReceipt: false,
  ...fields,
});

const share = (expenseId: string, userId: string, minor: number): ShareRow => ({
  expense_id: expenseId,
  user_id: userId,
  weight: null,
  fixed_minor: null,
  computed_minor: minor,
  crew_computed_minor: null,
  excluded_reason: null,
});

const headings = {
  date: 'Date',
  what: 'What',
  category: 'Category',
  paidBy: 'Paid by',
  amount: 'Amount',
  currency: 'Currency',
  crewAmount: 'In USD',
};

describe('the trip books as CSV', () => {
  it('writes exact decimals for every currency exponent', () => {
    expect(decimalOf(18_640n, 'USD')).toBe('186.40');
    expect(decimalOf(5n, 'USD')).toBe('0.05');
    expect(decimalOf(-305n, 'EUR')).toBe('-3.05');
    expect(decimalOf(450_000n, 'JPY')).toBe('450000');
    expect(decimalOf(1_234n, 'KWD')).toBe('1.234');
  });

  it('quotes commas and quotes, and keeps formula-like typed text as text', () => {
    expect(csvCell('Bread, wine')).toBe('"Bread, wine"');
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-2 beers')).toBe("'-2 beers");
  });

  it('lists expenses by day with each member share, leaving out queued deletes', () => {
    const csv = expensesCsv({
      items: [
        item({
          id: 'e2',
          title: 'Taxi',
          localDate: '2026-10-13',
          currency: 'USD',
          amountMinor: 1_000n,
          crewAmountMinor: null,
        }),
        item({ id: 'e1' }),
        item({ id: 'e3', pending: 'delete' }),
      ],
      shares: [
        share('e1', 'u-maya', 22_500_000),
        share('e1', 'u-jo', 22_500_000),
        share('e2', 'u-jo', 1_000),
      ],
      members: [
        { userId: 'u-maya', name: 'Maya' },
        { userId: 'u-jo', name: 'Jo' },
      ],
      crewCurrency: 'USD',
      headings,
      categoryName: (category) => (category === 'food' ? 'Food' : 'Other'),
    });
    expect(csv.split('\r\n')).toEqual([
      'Date,What,Category,Paid by,Amount,Currency,In USD,Maya,Jo',
      '2026-10-12,Lunch,Food,Maya,450000.00,IDR,28.80,225000.00,225000.00',
      '2026-10-13,Taxi,Food,Maya,10.00,USD,10.00,,10.00',
    ]);
  });
});
