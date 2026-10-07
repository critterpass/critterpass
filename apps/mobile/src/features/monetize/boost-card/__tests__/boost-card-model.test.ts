import { describe, expect, it } from '@jest/globals';

import {
  boostCardModel,
  shareText,
  type CardBoost,
  type CardInput,
  type CardPayment,
  type CardShare,
} from '../boost-card-model';

const BUYER = 'u-winston';
const MAYA = 'u-maya';
const JORDAN = 'u-jordan';
const LATE = 'u-late';

const boost = (extra: Partial<CardBoost> = {}): CardBoost => ({
  id: 'b1',
  buyerId: BUYER,
  status: 'active',
  split: true,
  splitMemberIds: [BUYER, MAYA, JORDAN],
  thankedBy: [],
  createdAt: '2027-04-01T10:00:00.000Z',
  ...extra,
});

const share = (userId: string, minor: number): CardShare => ({
  userId,
  name: userId.slice(2),
  minor,
  currency: 'USD',
});
const SHARES = [share(BUYER, 401), share(MAYA, 399), share(JORDAN, 399)];

const payment = (fromId: string, extra: Partial<CardPayment> = {}): CardPayment => ({
  fromId,
  toId: BUYER,
  status: 'confirmed',
  createdAt: '2027-04-02T10:00:00.000Z',
  ...extra,
});

const input = (extra: Partial<CardInput> = {}): CardInput => ({
  viewerUid: MAYA,
  boost: boost(),
  shares: SHARES,
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

  it('counts a share as settled once its member paid the buyer after the boost', () => {
    const model = boostCardModel(input({ payments: [payment(MAYA, { status: 'marked_paid' })] }));
    expect(model).toMatchObject({
      viewer: 'settled',
      share: null,
      settled: [{ uid: MAYA, name: 'maya' }],
      remaining: 1,
    });
  });

  it('ignores payments that are open, to someone else, or older than the boost', () => {
    const model = boostCardModel(
      input({
        payments: [
          payment(MAYA, { status: 'requested' }),
          payment(MAYA, { status: 'cancelled' }),
          payment(MAYA, { toId: JORDAN }),
          payment(JORDAN, { createdAt: '2027-03-20 09:00:00.000Z' }),
        ],
      }),
    );
    expect(model).toMatchObject({ viewer: 'owes', settled: [], remaining: 2 });
  });

  it('shows the buyer who is still to go and never a thanks or a share', () => {
    const model = boostCardModel(input({ viewerUid: BUYER, payments: [payment(JORDAN)] }));
    expect(model).toMatchObject({ viewer: 'buyer', share: null, thanks: 'none', remaining: 1 });
  });

  it('says everyone is square when every share is settled', () => {
    const model = boostCardModel(input({ payments: [payment(MAYA), payment(JORDAN)] }));
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
      input({ boost: boost({ split: false, splitMemberIds: [] }), shares: [] }),
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
