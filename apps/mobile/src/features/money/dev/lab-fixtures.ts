/**
 * The Bali Six, as the money designs draw them, for the (dev) money lab: six members, the ledger
 * that nets to +186.40 / +41.00 / 0 / −41.00 / −92.10 / −94.30, the Ibu Oka receipt and its
 * suggestions, all run through the same engine code the screens use.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture names and ids, only in the (dev) lab. */
import type { ReceiptSuggestions } from '@cp/domain';

import type { MoneyMember } from '../data/context';
import type { ExpenseItem } from '../data/expense-items';
import type { LedgerRow, PaymentRow } from '../data/queries';
import type { ParsedReceipt } from '../receipt/review-model';

export const LAB_UID = 'u-winston';

export const LAB_MEMBERS: readonly MoneyMember[] = [
  ['u-winston', 'Winston'],
  ['u-maya', 'Maya'],
  ['u-alex', 'Alex'],
  ['u-jordan', 'Jordan'],
  ['u-rin', 'Rin'],
  ['u-dev', 'Dev'],
].map(([userId = '', name = ''], joinIndex) => ({ userId, name, joinIndex, active: true }));

const entry = (debtor: string, creditor: string, amount: number): LedgerRow => ({
  debtor_id: debtor,
  creditor_id: creditor,
  amount_minor: amount,
  currency: 'USD',
});

export const LAB_LEDGER: readonly LedgerRow[] = [
  entry('u-jordan', 'u-winston', 9210),
  entry('u-alex', 'u-winston', 9430),
  entry('u-rin', 'u-maya', 4100),
];

export function labPayment(
  id: string,
  from: string,
  to: string,
  amount: number,
  status: string,
): PaymentRow {
  return {
    id,
    from_id: from,
    to_id: to,
    amount_minor: amount,
    currency: 'USD',
    method: status === 'confirmed' ? 'bank' : null,
    status,
    requested_at: status === 'pending' ? null : '2026-10-15T09:00:00Z',
    last_nudged_at: null,
    marked_at: null,
    confirmed_at: status === 'confirmed' ? '2026-10-15T12:00:00Z' : null,
    auto_confirmed: 0,
    disputed_at: status === 'disputed' ? '2026-10-15T12:00:00Z' : null,
    dispute_note: null,
    reissued_from_id: null,
    version: 1,
    updated_at: null,
  };
}

export const LAB_LATEST: ExpenseItem = {
  id: 'e-ibu-oka',
  title: 'Babi guling, Ibu Oka',
  category: 'food',
  payerId: 'u-maya',
  payerName: 'Maya',
  amountMinor: 108_000_000n,
  currency: 'IDR',
  crewAmountMinor: 6820n,
  localDate: '2026-10-14',
  spentAt: '2026-10-14T05:12:00Z',
  leftOut: [],
  shareCount: 6,
  inSplit: LAB_MEMBERS.map((member) => member.userId),
  pending: null,
  fromReceipt: true,
};

export const LAB_HISTORY: readonly ExpenseItem[] = [
  {
    ...LAB_LATEST,
    id: 'e-smoothie',
    title: 'Smoothie bowls, Clear Café',
    payerId: LAB_UID,
    payerName: 'Winston',
    amountMinor: 45_000_000n,
    crewAmountMinor: null,
    localDate: '2026-10-15',
    spentAt: '2026-10-15T01:30:00Z',
    fromReceipt: false,
    pending: 'add',
  },
  LAB_LATEST,
  {
    ...LAB_LATEST,
    id: 'e-scooters',
    title: 'Scooter hire',
    category: 'transit',
    payerId: 'u-alex',
    payerName: 'Alex',
    amountMinor: 60_000_000n,
    crewAmountMinor: 3789n,
    leftOut: ['Dev'],
    shareCount: 5,
    fromReceipt: false,
  },
  {
    ...LAB_LATEST,
    id: 'e-villa',
    title: 'Villa Sungai, two nights',
    category: 'stays',
    payerId: LAB_UID,
    payerName: 'Winston',
    amountMinor: 64_800n,
    currency: 'USD',
    crewAmountMinor: 64_800n,
    localDate: '2026-10-13',
    spentAt: '2026-10-13T08:00:00Z',
    fromReceipt: false,
  },
];

export const LAB_FX = {
  snapshotId: 'fx-lab',
  snapshots: [{ base: 'USD', quote: 'IDR', rate: '15835', asOf: '2026-10-14', source: 'ecb' }],
};

export const IBU_OKA: ParsedReceipt = {
  merchant: 'Ibu Oka',
  datetime: '2026-10-14T13:12:00+08:00',
  currency: 'IDR',
  lines: [
    { line_id: 'l3', label: 'Babi guling', qty: 5, amount_minor: 85_000_000, kind: 'item' },
    { line_id: 'l4', label: 'Es kelapa', qty: 6, amount_minor: 13_000_000, kind: 'item' },
    { line_id: 'l5', label: 'Service 10%', qty: null, amount_minor: 10_000_000, kind: 'service' },
  ],
  total_minor: 108_000_000,
  total_line_id: 'l6',
  lines_total_minor: 108_000_000,
  matches_total: true,
  status: 'parsed',
};

export const IBU_OKA_TOTAL_ONLY: ParsedReceipt = {
  ...IBU_OKA,
  lines: [],
  lines_total_minor: 0,
  matches_total: false,
  status: 'partial',
};

export const IBU_OKA_SUGGESTIONS: ReceiptSuggestions = {
  payer_uid: 'u-maya',
  payer_reason: 'scanned',
  adjustments: 'by_share',
  lines: [
    {
      line_id: 'l3',
      exclude: ['u-jordan'],
      reasons: [{ user_id: 'u-jordan', kind: 'dietary', flag: 'halal', food: 'pork' }],
    },
  ],
};
