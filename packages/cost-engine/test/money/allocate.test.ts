import { DomainError } from '@cp/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { allocate } from '../../src/money/allocate';
import { money, sumMoney } from '../../src/money/money';

describe('allocate: largest remainder with deterministic tie-break', () => {
  it('splits an evenly-divisible total exactly equally', () => {
    const shares = allocate(money(900n, 'SGD'), [
      { id: 'alex', weight: 1n },
      { id: 'blair', weight: 1n },
      { id: 'cass', weight: 1n },
    ]);
    expect(shares.map((s) => s.amount.amountMinor)).toEqual([300n, 300n, 300n]);
  });

  it('gives the leftover minor unit to the largest remainder, ties broken by ascending id', () => {
    // 100 minor units / 3 people: 33 each, remainder 1 for every one of them (100 % 3 == 1
    // for every equal weight) — a genuine three-way tie, so the extra cent must go to "alex".
    const shares = allocate(money(100n, 'SGD'), [
      { id: 'cass', weight: 1n },
      { id: 'alex', weight: 1n },
      { id: 'blair', weight: 1n },
    ]);
    const byId = Object.fromEntries(shares.map((s) => [s.id, s.amount.amountMinor]));
    expect(byId).toEqual({ cass: 33n, alex: 34n, blair: 33n });
  });

  it('gives a zero-weight (excluded) participant exactly zero, never a tie-break bump', () => {
    const shares = allocate(money(10n, 'SGD'), [
      { id: 'excluded', weight: 0n },
      { id: 'payer', weight: 1n },
    ]);
    const byId = Object.fromEntries(shares.map((s) => [s.id, s.amount.amountMinor]));
    expect(byId).toEqual({ excluded: 0n, payer: 10n });
  });

  it('preserves the sign of a negative total (e.g. a reversal)', () => {
    const shares = allocate(money(-100n, 'SGD'), [
      { id: 'a', weight: 1n },
      { id: 'b', weight: 1n },
      { id: 'c', weight: 1n },
    ]);
    expect(
      sumMoney(
        'SGD',
        shares.map((s) => s.amount),
      ),
    ).toEqual(money(-100n, 'SGD'));
  });

  it('splits by uneven weights proportionally', () => {
    const shares = allocate(money(1_000n, 'SGD'), [
      { id: 'two-shares', weight: 2n },
      { id: 'one-share', weight: 1n },
    ]);
    const byId = Object.fromEntries(shares.map((s) => [s.id, s.amount.amountMinor]));
    expect(byId).toEqual({ 'two-shares': 667n, 'one-share': 333n });
  });

  it('sums exactly for a zero-exponent currency total (IDR/JPY, F-021 done-when)', () => {
    for (const currency of ['IDR', 'JPY'] as const) {
      const total = money(1_000_001n, currency);
      const shares = allocate(total, [
        { id: 'a', weight: 1n },
        { id: 'b', weight: 1n },
        { id: 'c', weight: 1n },
      ]);
      expect(
        sumMoney(
          currency,
          shares.map((s) => s.amount),
        ),
      ).toEqual(total);
    }
  });

  it('rejects an empty weight list', () => {
    expect(() => allocate(money(100n, 'SGD'), [])).toThrow(DomainError);
  });

  it('rejects a negative weight', () => {
    expect(() =>
      allocate(money(100n, 'SGD'), [
        { id: 'a', weight: -1n },
        { id: 'b', weight: 2n },
      ]),
    ).toThrow(DomainError);
  });

  it('rejects a zero total weight', () => {
    expect(() =>
      allocate(money(100n, 'SGD'), [
        { id: 'a', weight: 0n },
        { id: 'b', weight: 0n },
      ]),
    ).toThrow(DomainError);
  });

  it('rejects a duplicate id (would otherwise make the tie-break ambiguous)', () => {
    expect(() =>
      allocate(money(100n, 'SGD'), [
        { id: 'a', weight: 1n },
        { id: 'a', weight: 1n },
      ]),
    ).toThrow(DomainError);
  });
});

describe('property: shares always sum exactly back to the total (10k cases)', () => {
  // uniqueArray on `id` rules out a (vanishingly unlikely but possible) duplicate-id shrink target,
  // which would otherwise legitimately throw per the "rejects a duplicate id" behaviour above.
  const participantArb = fc.uniqueArray(
    fc.record({
      id: fc.uuid(),
      weight: fc.bigInt({ min: 0n, max: 1_000n }),
    }),
    { minLength: 1, maxLength: 12, selector: (participant) => participant.id },
  );

  it('sum(allocate(total, weights)) === total, for arbitrary positive totals and weights', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10_000_000n }),
        participantArb.filter((ps) => ps.reduce((sum, p) => sum + p.weight, 0n) > 0n),
        (amount, participants) => {
          const total = money(amount, 'SGD');
          const shares = allocate(total, participants);
          return (
            sumMoney(
              'SGD',
              shares.map((s) => s.amount),
            ).amountMinor === total.amountMinor
          );
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it('is deterministic: the same input always produces the same output', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10_000_000n }),
        participantArb.filter((ps) => ps.reduce((sum, p) => sum + p.weight, 0n) > 0n),
        (amount, participants) => {
          const total = money(amount, 'SGD');
          const first = allocate(total, participants);
          const second = allocate(total, participants);
          return (
            JSON.stringify(first, (_key, value: unknown) =>
              typeof value === 'bigint' ? value.toString() : value,
            ) ===
            JSON.stringify(second, (_key, value: unknown) =>
              typeof value === 'bigint' ? value.toString() : value,
            )
          );
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it('every share is within one minor unit of the exact proportional amount', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10_000_000n }),
        participantArb.filter((ps) => ps.reduce((sum, p) => sum + p.weight, 0n) > 0n),
        (amount, participants) => {
          const total = money(amount, 'SGD');
          const totalWeight = participants.reduce((sum, p) => sum + p.weight, 0n);
          const shares = allocate(total, participants);
          return shares.every((share) => {
            const participant = participants.find((p) => p.id === share.id);
            if (!participant) return false;
            const exactNumerator = amount * participant.weight;
            const floorShare = exactNumerator / totalWeight;
            const diff = share.amount.amountMinor - floorShare;
            return diff === 0n || diff === 1n;
          });
        },
      ),
      { numRuns: 10_000 },
    );
  });
});
