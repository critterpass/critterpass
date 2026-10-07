import { describe, expect, it } from '@jest/globals';

import {
  boostCardModel,
  shareText,
  type CardBoost,
  type CardInput,
  type CardLedgerEntry,
  type CardPayment,
  type CardShare,
} from '../boost-card-model';

const BUYER = 'u-winston';
const MAYA = 'u-maya';
const JORDAN = 'u-jordan';
const LATE = 'u-late';
const EXPENSE = 'e-boost';

const boost = (extra: Partial<CardBoost> = {}): CardBoost => ({
  id: 'b1',
  buyerId: BUYER,
  status: 'active',
  split: true,
  splitMemberIds: [BUYER, MAYA, JORDAN],
  thankedBy: [],
  ...extra,
});

const share = (userId: string, minor: number): CardShare => ({
  userId,
  name: userId.slice(2),
  minor,
  currency: 'USD',
});
const SHARES = [share(BUYER, 401), share(MAYA, 399), share(JORDAN, 399)];

/** `debtorId` owes `creditorId`; a confirmed payment is the same move the other way round. */
const owes = (
  debtorId: string,
  creditorId: string,
  minor: number,
  extra: Partial<CardLedgerEntry> = {},
): CardLedgerEntry => ({
  debtorId,
  creditorId,
  minor,
  currency: 'USD',
  sourceKind: 'expense',
  sourceId: 'e-dinner',
  ...extra,
});
const iou = (debtorId: string): CardLedgerEntry =>
  owes(debtorId, BUYER, 399, { sourceKind: 'boost_iou', sourceId: EXPENSE });
const confirmed = (fromId: string, toId: string, minor: number): CardLedgerEntry =>
  owes(toId, fromId, minor, { sourceKind: 'payment', sourceId: `p-${fromId}-${minor}` });
const IOUS = [iou(MAYA), iou(JORDAN)];

const payment = (fromId: string, minor: number, extra: Partial<CardPayment> = {}): CardPayment => ({
  fromId,
  toId: BUYER,
  minor,
  currency: 'USD',
  status: 'marked_paid',
  ...extra,
});

const input = (extra: Partial<CardInput> = {}): CardInput => ({
  viewerUid: MAYA,
  boost: boost(),
  expense: { id: EXPENSE, ledgerCurrency: 'USD' },
  shares: SHARES,
  ledger: IOUS,
  payments: [],
  ...extra,
});

describe('the crew boost card', () => {
  it('waits for the boost row', () => {
    expect(boostCardModel(input({ boost: null }))).toEqual({ kind: 'loading' });
  });

  it('offers a member their own share to settle and a thanks', () => {
    expect(boostCardModel(input())).toMatchObject({
      kind: 'live',
      ways: 3,
      viewer: 'owes',
      share: { minor: 399, currency: 'USD' },
      thanks: 'offer',
      settled: [],
      remaining: 2,
      allSquare: false,
    });
  });

  it('settles a share when its member pays it, marked paid or confirmed', () => {
    const marked = boostCardModel(input({ payments: [payment(MAYA, 399)] }));
    expect(marked).toMatchObject({
      viewer: 'settled',
      share: null,
      settled: [{ uid: MAYA, name: 'maya' }],
      remaining: 1,
    });
    const paid = boostCardModel(input({ ledger: [...IOUS, confirmed(MAYA, BUYER, 399)] }));
    expect(paid).toMatchObject({ viewer: 'settled', settled: [{ uid: MAYA }], remaining: 1 });
  });

  it('keeps the share open when the member repays the buyer for something else', () => {
    // Maya owes Winston 2,000 for dinner and 399 for the boost; she repays the dinner only.
    const ledger = [...IOUS, owes(MAYA, BUYER, 2000), confirmed(MAYA, BUYER, 2000)];
    expect(boostCardModel(input({ ledger }))).toMatchObject({
      viewer: 'owes',
      share: { minor: 399, currency: 'USD' },
      settled: [],
      remaining: 2,
    });
    const marked = input({
      ledger: [...IOUS, owes(MAYA, BUYER, 2000)],
      payments: [payment(MAYA, 2000)],
    });
    expect(boostCardModel(marked)).toMatchObject({ viewer: 'owes', settled: [] });
  });

  it('keeps the share open after a part payment, and settles it with the rest', () => {
    const part = boostCardModel(input({ payments: [payment(MAYA, 200)] }));
    expect(part).toMatchObject({ viewer: 'owes', settled: [], remaining: 2 });
    const rest = boostCardModel(
      input({ ledger: [...IOUS, confirmed(MAYA, BUYER, 200)], payments: [payment(MAYA, 199)] }),
    );
    expect(rest).toMatchObject({ viewer: 'settled', remaining: 1 });
  });

  it('ignores payments that are open, disputed, in another currency or someone else’s', () => {
    const model = boostCardModel(
      input({
        payments: [
          payment(MAYA, 399, { status: 'requested' }),
          payment(MAYA, 399, { status: 'pending' }),
          payment(MAYA, 399, { status: 'disputed' }),
          payment(MAYA, 399, { status: 'cancelled' }),
          payment(MAYA, 399, { currency: 'JPY' }),
          payment(LATE, 399, { toId: JORDAN }),
        ],
      }),
    );
    expect(model).toMatchObject({ viewer: 'owes', settled: [], remaining: 2 });
  });

  it('nets the trip: a member who is owed as much elsewhere has nothing left to pay', () => {
    // Winston owes Maya 1,000 for the hotel, more than her share of the boost.
    const owed = boostCardModel(input({ ledger: [...IOUS, owes(BUYER, MAYA, 1000)] }));
    expect(owed).toMatchObject({ viewer: 'settled', settled: [{ uid: MAYA }], remaining: 1 });
    // Jordan owes Maya 399: settling up sends his money to her, and both shares are done once
    // she is owed nothing more and he has paid what he owes in all.
    const ledger = [...IOUS, owes(JORDAN, MAYA, 399)];
    expect(boostCardModel(input({ ledger }))).toMatchObject({
      viewer: 'settled',
      settled: [{ uid: MAYA }],
      remaining: 1,
    });
    const paid = boostCardModel(
      input({ ledger, payments: [payment(JORDAN, 798, { toId: BUYER })] }),
    );
    expect(paid).toMatchObject({ allSquare: true, remaining: 0 });
  });

  it('pays the share through whoever settling up names, not only the buyer', () => {
    // Winston owes Jordan 798 elsewhere, so the plan has Maya pay Jordan directly.
    const ledger = [...IOUS, owes(BUYER, JORDAN, 798), confirmed(MAYA, JORDAN, 399)];
    expect(boostCardModel(input({ ledger }))).toMatchObject({
      viewer: 'settled',
      settled: [{ uid: MAYA }, { uid: JORDAN }],
      allSquare: true,
    });
  });

  it('claims nothing settled before the split’s IOUs reach the ledger', () => {
    expect(boostCardModel(input({ ledger: [] }))).toMatchObject({ viewer: 'owes', settled: [] });
    expect(boostCardModel(input({ ledger: [], expense: null }))).toMatchObject({
      viewer: 'owes',
      settled: [],
    });
    const other = [owes(MAYA, BUYER, 399, { sourceKind: 'boost_iou', sourceId: 'e-other' })];
    expect(
      boostCardModel(input({ ledger: [...other, confirmed(MAYA, BUYER, 399)] })),
    ).toMatchObject({ viewer: 'owes', settled: [] });
  });

  it('shows the buyer who is still to go and never a thanks or a share', () => {
    const model = boostCardModel(input({ viewerUid: BUYER, payments: [payment(JORDAN, 399)] }));
    expect(model).toMatchObject({ viewer: 'buyer', share: null, thanks: 'none', remaining: 1 });
  });

  it('says everyone is square when every share is settled', () => {
    const model = boostCardModel(input({ payments: [payment(MAYA, 399), payment(JORDAN, 399)] }));
    expect(model).toMatchObject({ allSquare: true, remaining: 0 });
  });

  it('asks nothing of someone who joined after the boost', () => {
    expect(boostCardModel(input({ viewerUid: LATE }))).toMatchObject({
      viewer: 'free',
      share: null,
      thanks: 'offer',
    });
  });

  it('is thanks only when the buyer covered it', () => {
    const model = boostCardModel(
      input({
        boost: boost({ split: false, splitMemberIds: [] }),
        shares: [],
        ledger: [],
        expense: null,
      }),
    );
    expect(model).toMatchObject({
      split: false,
      ways: 0,
      splitPending: false,
      viewer: 'free',
      thanks: 'offer',
      remaining: 0,
      allSquare: false,
    });
  });

  it('flips the thanks once sent', () => {
    expect(boostCardModel(input({ boost: boost({ thankedBy: [MAYA] }) }))).toMatchObject({
      thanks: 'sent',
    });
  });

  it('knows a split whose shares are not written yet, and asks nobody to settle', () => {
    expect(boostCardModel(input({ shares: [] }))).toMatchObject({
      split: true,
      splitPending: true,
      ways: 3,
      viewer: 'free',
      share: null,
    });
  });

  it('greys a boost that was refunded or moved', () => {
    expect(boostCardModel(input({ boost: boost({ status: 'revoked' }) }))).toEqual({
      kind: 'gone',
      reason: 'revoked',
    });
    expect(boostCardModel(input({ boost: boost({ status: 'moved' }) }))).toEqual({
      kind: 'gone',
      reason: 'moved',
    });
  });

  it('keeps an ended boost’s card and its open shares', () => {
    expect(boostCardModel(input({ boost: boost({ status: 'ended' }) }))).toMatchObject({
      kind: 'live',
      viewer: 'owes',
    });
  });
});

describe('shareText', () => {
  it('drops the decimals of a whole share only', () => {
    expect(shareText({ minor: 200, currency: 'USD' }, 'en')).toBe('$2');
    expect(shareText({ minor: 171, currency: 'USD' }, 'en')).toBe('$1.71');
    expect(shareText({ minor: 50000, currency: 'VND' }, 'en')).toBe('₫50,000');
  });
});
