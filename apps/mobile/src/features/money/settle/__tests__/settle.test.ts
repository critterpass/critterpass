import { hasValidCrc } from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import { SYNCED_TABLE_COLUMNS } from '@/data/powersync/synced-tables.generated';

import type { PaymentRow } from '../../data/queries';
import { actionsFor, canRemind, openCount, settleRows } from '../model';
import { payoutQr } from '../payout-qr';

const now = new Date('2026-10-15T12:00:00Z');

function payment(
  id: string,
  from: string,
  to: string,
  amount: number,
  status: string,
  extra: Partial<PaymentRow> = {},
): PaymentRow {
  return {
    id,
    from_id: from,
    to_id: to,
    amount_minor: amount,
    currency: 'USD',
    method: null,
    status,
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
    ...extra,
  };
}

const plan = [
  { fromId: 'jordan', toId: 'you', amountMinor: 9210n },
  { fromId: 'alex', toId: 'you', amountMinor: 9430n },
  { fromId: 'rin', toId: 'maya', amountMinor: 4100n },
];

describe('settle up rows', () => {
  it('shows payments with their status and the plan rows nobody has requested yet', () => {
    const rows = settleRows({
      uid: 'you',
      payments: [
        payment('p1', 'jordan', 'you', 9210, 'requested'),
        payment('p2', 'alex', 'you', 9430, 'confirmed'),
      ],
      plan: plan.slice(0, 1).concat(plan.slice(2)),
      currency: 'USD',
      now,
    });
    expect(rows.map((row) => [row.key, row.status, row.role])).toEqual([
      ['p1', 'requested', 'payee'],
      ['plan:rin:maya', 'plan', 'other'],
      ['p2', 'confirmed', 'payee'],
    ]);
    expect(openCount(rows)).toBe(2);
    expect(canRemind(rows)).toBe(true);
  });

  it('offers the payee request, nudge, confirm and dispute as the state machine allows', () => {
    expect(actionsFor('plan', 'payee', null, now)).toEqual(['request']);
    expect(actionsFor('requested', 'payee', null, now)).toEqual(['nudge', 'confirm']);
    expect(actionsFor('marked_paid', 'payee', null, now)).toEqual(['confirm', 'dispute']);
    expect(actionsFor('disputed', 'payee', null, now)).toEqual(['confirm']);
    expect(actionsFor('confirmed', 'payee', null, now)).toEqual([]);
  });

  it('nudges a pair at most once a day', () => {
    expect(actionsFor('requested', 'payee', '2026-10-15T02:00:00Z', now)).toEqual(['confirm']);
    expect(actionsFor('requested', 'payee', '2026-10-14T11:00:00Z', now)).toEqual([
      'nudge',
      'confirm',
    ]);
  });

  it('lets the payer pay until they have marked it, and others only watch', () => {
    expect(actionsFor('requested', 'payer', null, now)).toEqual(['pay']);
    expect(actionsFor('plan', 'payer', null, now)).toEqual(['pay']);
    expect(actionsFor('marked_paid', 'payer', null, now)).toEqual([]);
    expect(actionsFor('requested', 'other', null, now)).toEqual([]);
  });

  it('drops cancelled payments and does not repeat a transfer already requested', () => {
    const rows = settleRows({
      uid: 'maya',
      payments: [
        payment('old', 'rin', 'maya', 5000, 'cancelled'),
        payment('p3', 'rin', 'maya', 4100, 'marked_paid'),
      ],
      plan,
      currency: 'USD',
      now,
    });
    expect(rows.filter((row) => row.fromId === 'rin')).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'p3', actions: ['confirm', 'dispute'] });
  });
});

describe('payout QR', () => {
  const method = (kind: 'paynow' | 'vietqr' | 'bank', details: object) => ({
    method_id: 'm',
    kind,
    country: null,
    label: kind,
    details: details as never,
  });

  it('builds a PayNow payload with the amount when the payment is in dollars of Singapore', () => {
    const qr = payoutQr(
      method('paynow', { proxy_type: 'mobile', proxy: '+6591234567', name: 'Winston' }),
      4100n,
      'SGD',
    );
    expect(qr?.withAmount).toBe(true);
    expect(qr?.payload).toContain('SG.PAYNOW');
    expect(qr?.payload).toContain('5405' + '41.00');
    expect(hasValidCrc(qr?.payload ?? '')).toBe(true);
  });

  it('leaves the amount to the payer when the payment is in another currency', () => {
    const qr = payoutQr(
      method('vietqr', { bank_bin: '970415', account_number: '0123456789' }),
      9210n,
      'USD',
    );
    expect(qr?.withAmount).toBe(false);
    expect(hasValidCrc(qr?.payload ?? '')).toBe(true);
  });

  it('has no QR for a bank transfer or details that do not validate', () => {
    expect(
      payoutQr(
        method('bank', { bank_name: 'DBS', account_name: 'W', account_number: '1' }),
        1n,
        'SGD',
      ),
    ).toBeNull();
    expect(
      payoutQr(method('paynow', { proxy_type: 'mobile', proxy: 'nope', name: 'W' }), 1n, 'SGD'),
    ).toBeNull();
  });
});

describe('payout details stay off the device', () => {
  it('never syncs a table or column that could hold them', () => {
    expect(Object.keys(SYNCED_TABLE_COLUMNS)).not.toContain('payout_methods');
    expect(Object.values(SYNCED_TABLE_COLUMNS).join(' ')).not.toMatch(
      /details_enc|account_number/u,
    );
  });
});
