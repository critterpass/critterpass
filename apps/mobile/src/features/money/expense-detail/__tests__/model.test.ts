import { describe, expect, it } from '@jest/globals';

import { canChangeExpense, changedFields, changesOf, fxLine } from '../model';

const snap = (fields: object) => JSON.stringify(fields);

describe('expense detail rules', () => {
  it('lets whoever added it, whoever paid, or an organiser change an expense', () => {
    const base = { createdBy: 'maya', payerId: 'jordan', organiser: false };
    expect(canChangeExpense({ ...base, uid: 'maya' })).toBe(true);
    expect(canChangeExpense({ ...base, uid: 'jordan' })).toBe(true);
    expect(canChangeExpense({ ...base, uid: 'dev' })).toBe(false);
    expect(canChangeExpense({ ...base, uid: 'dev', organiser: true })).toBe(true);
    expect(canChangeExpense({ ...base, uid: null, organiser: true })).toBe(false);
  });

  it('lists edits and the delete as changes, never the row written when it was added', () => {
    const rows = [{ kind: 'deleted' }, { kind: 'edited' }, { kind: 'created' }];
    expect(changesOf(rows)).toEqual([{ kind: 'deleted' }, { kind: 'edited' }]);
    expect(changesOf([{ kind: 'created' }])).toEqual([]);
  });

  it('names what an edit changed', () => {
    const before = {
      amount_minor: 100,
      currency: 'USD',
      payer_id: 'a',
      split_mode: 'equal',
      description: 'x',
      category: 'food',
      spent_at: 't',
      shares: [{ user_id: 'a', computed_minor: 100 }],
    };
    expect(
      changedFields({
        before: snap(before),
        after: snap({ ...before, payer_id: 'b', category: 'fun' }),
      }),
    ).toEqual(['payer', 'category']);
    // A new amount re-splits every share; the split itself did not change.
    expect(
      changedFields({
        before: snap(before),
        after: snap({
          ...before,
          amount_minor: 200,
          shares: [{ user_id: 'a', computed_minor: 200 }],
        }),
      }),
    ).toEqual(['amount']);
    expect(
      changedFields({ before: snap(before), after: snap({ ...before, split_mode: 'weights' }) }),
    ).toEqual(['split']);
    expect(changedFields({ before: null, after: null })).toEqual([]);
  });

  it('reads the rate so the number is at least one', () => {
    expect(
      fxLine({
        amountMajor: 1080000,
        currency: 'IDR',
        crewAmountMajor: 68.2,
        crewCurrency: 'USD',
        snapshot: { as_of: '2026-10-14' },
      }),
    ).toMatchObject({ from: 'USD', to: 'IDR', asOf: '2026-10-14' });
    expect(
      fxLine({
        amountMajor: 10,
        currency: 'USD',
        crewAmountMajor: 13.4,
        crewCurrency: 'SGD',
        snapshot: null,
      }),
    ).toMatchObject({ from: 'USD', to: 'SGD', rate: 1.34 });
    expect(
      fxLine({
        amountMajor: 10,
        currency: 'USD',
        crewAmountMajor: 10,
        crewCurrency: 'USD',
        snapshot: null,
      }),
    ).toBeNull();
  });
});
