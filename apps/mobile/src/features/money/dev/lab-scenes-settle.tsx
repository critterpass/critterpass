/**
 * Money lab scenes for settling up (3i-5) and around it: the payee's list as drawn, the payer's
 * payment with a PayNow QR, a disputed payment, nothing to settle, the square trip with its
 * sticker, and the payout editor.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { settleRows } from '../settle/model';
import { PaymentDetail } from '../settle/PaymentDetail';
import { PayoutMethodsEditor } from '../settle/PayoutMethodsEditor';
import { SettleList } from '../settle/SettleList';
import { LAB_MEMBERS, LAB_UID, labPayment } from './lab-fixtures';

const noop = () => undefined;
const now = new Date('2026-10-15T12:00:00Z');

const DRAWN = [
  labPayment('p-jordan', 'u-jordan', LAB_UID, 9210, 'requested'),
  labPayment('p-alex', 'u-alex', LAB_UID, 9430, 'confirmed'),
];
const PLAN = [{ fromId: 'u-rin', toId: 'u-maya', amountMinor: 4100n }];

function list(uid: string, payments = DRAWN, plan = PLAN) {
  return settleRows({ uid, payments, plan, currency: 'USD', now });
}

function Settle({
  rows,
  settled = false,
}: {
  readonly rows: ReturnType<typeof list>;
  readonly settled?: boolean;
}) {
  return (
    <SettleList
      rows={rows}
      members={LAB_MEMBERS}
      expenses={23}
      open={rows.filter((row) => row.status !== 'confirmed').length}
      people={6}
      settled={settled}
      offline={false}
      kinds={['bank', 'paynow', 'cash']}
      myKinds={['bank']}
      canRemind={rows.some((row) => row.role === 'payee' && row.status !== 'confirmed')}
      reminding={false}
      onKind={noop}
      onNudge={noop}
      onRow={noop}
      onRemind={noop}
    />
  );
}

function Payment({ uid, status }: { readonly uid: string; readonly status: string }) {
  const rows = list(uid, [labPayment('p-rin', 'u-rin', 'u-maya', 4100, status)], []);
  const row = rows[0];
  if (row === undefined) return null;
  return (
    <PaymentDetail
      row={status === 'disputed' ? { ...row, note: 'Nothing in my account yet.' } : row}
      fromName="Rin"
      toName="Maya"
      reveal={{
        kind: 'ok',
        methods: [
          {
            method_id: 'm1',
            kind: 'paynow',
            country: 'SG',
            label: 'PayNow',
            details: { proxy_type: 'mobile', proxy: '+6591234567', name: 'Maya Tan' },
          },
          {
            method_id: 'm2',
            kind: 'bank',
            country: 'SG',
            label: 'Bank',
            details: { bank_name: 'DBS', account_name: 'Maya Tan', account_number: '012-345678-9' },
          },
        ],
      }}
      method="paynow"
      amountDigits="4100"
      amountValid
      busy={false}
      onMethod={noop}
      onAmount={noop}
      onMarkPaid={noop}
      onRequest={noop}
      onNudge={noop}
      onConfirm={noop}
      onDispute={noop}
      onCopy={noop}
      onOpen={noop}
    />
  );
}

export const SETTLE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  settle: () => <Settle rows={list(LAB_UID)} />,
  'settle-nothing': () => <Settle rows={[]} />,
  'settle-square': () => (
    <Settle
      rows={list(
        LAB_UID,
        DRAWN.map((p) => ({ ...p, status: 'confirmed' })),
        [],
      )}
      settled
    />
  ),
  'payment-payer': () => <Payment uid="u-rin" status="requested" />,
  'payment-disputed': () => <Payment uid="u-maya" status="disputed" />,
  'payout-methods': () => (
    <PayoutMethodsEditor
      kinds={['bank', 'paynow', 'cash', 'wise_link']}
      saved={[]}
      kind="paynow"
      values={{ proxy: '+6591234567', name: 'Winston Lee' }}
      loading={false}
      busy={false}
      onKind={noop}
      onValue={noop}
      onSave={noop}
      onRemove={noop}
    />
  ),
};
