/**
 * The design's numbers, reproduced by the engine: the Ibu Oka receipt (Rp 1.080.000 at 15,835
 * IDR/USD; rupiah minor units are sen, ISO exponent 2: Jordan $1.50, everyone else $13.34), the same bill split evenly ($11.37 each), the
 * smoothie bowls typed in on the keypad (≈ $28.42 · $4.74 each) and the Bali Six balances.
 */
import { describe, expect, it } from 'vitest';

import { type FxContext } from '../../src/shares/fx';
import {
  balances,
  computeExpenseShares,
  deriveEntries,
  itemisedShares,
  perHeadMinor,
  reverseEntries,
  toCrewShares,
  type LedgerEntryDraft,
  type StoredLedgerEntry,
} from '../../src/ledger';
import { money } from '../../src/money/money';

// The crew in the order the app shows it (PAID BY: W M A J R D).
const [W, M, A, J, R, D] = ['you', 'maya', 'alex', 'jordan', 'rin', 'dev'] as const;
const CREW = [W, M, A, J, R, D];
const FX: FxContext = {
  snapshotId: 'fx-run',
  snapshots: [{ base: 'USD', quote: 'IDR', rate: '15835', asOf: '2026-10-14', source: 'test' }],
};

function cents(shares: readonly { userId: string; amountMinor: bigint }[]): Record<string, bigint> {
  return Object.fromEntries(shares.map((share) => [share.userId, share.amountMinor]));
}

describe('the Ibu Oka receipt', () => {
  const receipt = itemisedShares({
    members: CREW,
    payerId: M,
    lines: [
      // Babi guling ×5: NOT JORDAN.
      { lineId: 'l3', kind: 'item', amountMinor: 85_000_000n, assignees: [W, M, A, R, D] },
      // Es kelapa ×6: EVERYONE.
      { lineId: 'l4', kind: 'item', amountMinor: 13_000_000n, assignees: [] },
      // Service 10%: BY SHARE.
      { lineId: 'l5', kind: 'service', amountMinor: 10_000_000n },
    ],
  });

  it('adds up to the receipt total in rupiah', () => {
    expect(receipt.totalMinor).toBe(108_000_000n);
    expect(receipt.shares.reduce((sum, share) => sum + share.amountMinor, 0n)).toBe(108_000_000n);
  });

  it('charges Jordan $1.50 and everyone else $13.34', () => {
    const crew = toCrewShares(money(108_000_000n, 'IDR'), receipt.shares, 'USD', FX, M);
    expect(crew.total).toEqual(money(6_820n, 'USD'));
    expect(cents(crew.shares)).toEqual({
      [W]: 1_334n,
      [M]: 1_334n,
      [A]: 1_334n,
      [J]: 150n,
      [R]: 1_334n,
      [D]: 1_334n,
    });
  });

  it('turns into five IOUs to Maya, none from Maya herself', () => {
    const crew = toCrewShares(money(108_000_000n, 'IDR'), receipt.shares, 'USD', FX, M);
    const entries = deriveEntries({
      id: 'expense-1',
      crewId: 'crew',
      tripId: 'trip',
      payerId: M,
      crewCurrency: 'USD',
      crewShares: crew.shares,
    });
    expect(entries.map((entry) => [entry.debtorId, entry.amountMinor])).toEqual([
      [W, 1_334n],
      [A, 1_334n],
      [J, 150n],
      [R, 1_334n],
      [D, 1_334n],
    ]);
    expect(entries.every((entry) => entry.creditorId === M)).toBe(true);
  });
});

describe('even splits', () => {
  it('splits the Ibu Oka bill six ways at $11.37 each, to the cent', () => {
    const shares = computeExpenseShares({
      total: money(108_000_000n, 'IDR'),
      mode: 'equal',
      members: CREW.map((userId) => ({ userId })),
      payerId: M,
    });
    const crew = toCrewShares(money(108_000_000n, 'IDR'), shares, 'USD', FX, M);
    expect(perHeadMinor(crew.total.amountMinor, 6)).toBe(1_137n);
    // The two odd cents fall to the payer first, then in crew order.
    expect(cents(crew.shares)).toEqual({
      [W]: 1_137n,
      [M]: 1_137n,
      [A]: 1_137n,
      [J]: 1_137n,
      [R]: 1_136n,
      [D]: 1_136n,
    });
  });

  it('shows Rp 450.000 as ≈ $28.42, $4.74 each', () => {
    const shares = computeExpenseShares({
      total: money(45_000_000n, 'IDR'),
      mode: 'equal',
      members: CREW.map((userId) => ({ userId })),
      payerId: W,
    });
    const crew = toCrewShares(money(45_000_000n, 'IDR'), shares, 'USD', FX, W);
    expect(crew.total).toEqual(money(2_842n, 'USD'));
    expect(perHeadMinor(crew.total.amountMinor, 6)).toBe(474n);
  });
});

describe('the Bali Six balances', () => {
  it('nets +186.40 / +41.00 / 0 / −41.00 / −92.10 / −94.30 after an edit', () => {
    let seq = 0;
    const store = (drafts: LedgerEntryDraft[]): StoredLedgerEntry[] =>
      drafts.map((draft) => ({ ...draft, id: `entry-${(seq += 1)}` }));
    const expense = (id: string, payerId: string, fixed: Record<string, bigint>) => {
      const members = Object.entries(fixed).map(([userId, fixedMinor]) => ({ userId, fixedMinor }));
      const total = Object.values(fixed).reduce((sum, value) => sum + value, 0n);
      const shares = computeExpenseShares({
        total: money(total, 'USD'),
        mode: 'fixed',
        members,
        payerId,
      });
      return store(
        deriveEntries({
          id,
          crewId: 'crew',
          tripId: 'trip',
          payerId,
          crewCurrency: 'USD',
          crewShares: shares,
        }),
      );
    };
    const villa = expense('villa', W, { [W]: 12_000n, [J]: 9_210n, [A]: 9_430n, [D]: 0n });
    const firstDinner = expense('dinner', M, { [M]: 5_000n, [R]: 5_000n });
    const correction = store(reverseEntries(firstDinner));
    const dinner = expense('dinner', M, { [M]: 5_900n, [R]: 4_100n });
    const lunch = expense('lunch', D, { [D]: 2_000n });

    const nets = balances([...villa, ...firstDinner, ...correction, ...dinner, ...lunch], 'USD');
    expect(Object.fromEntries(nets)).toEqual({
      [W]: 18_640n,
      [M]: 4_100n,
      [R]: -4_100n,
      [J]: -9_210n,
      [A]: -9_430n,
    });
  });
});
