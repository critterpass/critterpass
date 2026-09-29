/**
 * Exactness under any input: every split sums to its expense, no share strays more than one minor
 * unit from its exact proportion, conversion keeps the crew shares summing to the converted total,
 * and any ledger (reversals included) nets to zero.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  balances,
  computeExpenseShares,
  deriveEntries,
  itemisedShares,
  reverseEntries,
  toCrewShares,
  type ReceiptLineKind,
  type StoredLedgerEntry,
} from '../../src/ledger';
import { money } from '../../src/money/money';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

const uid = (index: number) => `m${index.toString().padStart(2, '0')}`;
const total = fc.bigInt({ min: 1n, max: 100_000_000_000n });
const weights = fc
  .array(fc.integer({ min: 0, max: 20 }), { minLength: 1, maxLength: 16 })
  .filter((list) => list.some((weight) => weight > 0));
const sum = (values: readonly bigint[]) => values.reduce((acc, value) => acc + value, 0n);

describe('expense split properties', PROPERTY_SUITE_OPTIONS, () => {
  it('weighted and even splits sum exactly and stay within a unit of the exact share', () => {
    fc.assert(
      fc.property(total, weights, fc.nat(), fc.boolean(), (amount, list, payerSeed, even) => {
        const members = list.map((weight, index) => ({ userId: uid(index), weight }));
        const payerId = uid(payerSeed % list.length);
        const shares = computeExpenseShares({
          total: money(amount, 'IDR'),
          mode: even ? 'equal' : 'weights',
          members,
          payerId,
        });
        expect(sum(shares.map((share) => share.amountMinor))).toBe(amount);
        const used = list.map((weight) => BigInt(even ? 1 : weight));
        const weightSum = sum(used);
        shares.forEach((share, index) => {
          const exact = amount * (used[index] ?? 0n);
          const error = share.amountMinor * weightSum - exact;
          expect(error < weightSum && error > -weightSum).toBe(true);
          if ((used[index] ?? 0n) === 0n) expect(share.amountMinor).toBe(0n);
        });
      }),
      { numRuns: 2_000 },
    );
  });

  it('fixed splits pass through only when they add up to the expense', () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 0n, max: 10_000_000n }), { minLength: 1, maxLength: 16 }),
        fc.bigInt({ min: -5n, max: 5n }),
        (parts, drift) => {
          const amount = sum(parts) + drift;
          fc.pre(amount > 0n);
          const run = () =>
            computeExpenseShares({
              total: money(amount, 'USD'),
              mode: 'fixed',
              members: parts.map((fixedMinor, index) => ({ userId: uid(index), fixedMinor })),
              payerId: uid(0),
            });
          if (drift === 0n) {
            expect(run().map((share) => share.amountMinor)).toEqual(parts);
          } else {
            expect(run).toThrow();
          }
        },
      ),
    );
  });

  it('itemised receipts share every line out exactly', () => {
    const kind = fc.constantFrom<ReceiptLineKind>('item', 'item', 'item', 'service', 'tax', 'tip');
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 16 }),
        fc.array(
          fc.record({
            kind,
            amount: fc.bigInt({ min: 0n, max: 5_000_000n }),
            mask: fc.nat(),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        fc.bigInt({ min: 0n, max: 1_000_000n }),
        (size, lines, discount) => {
          const members = Array.from({ length: size }, (_, index) => uid(index));
          const itemised = lines.map((line, index) => ({
            lineId: `l${index}`,
            kind: line.kind,
            amountMinor: line.amount,
            assignees: members.filter((_, bit) => ((line.mask >> bit) & 1) === 1),
          }));
          const items = sum(itemised.filter((l) => l.kind === 'item').map((l) => l.amountMinor));
          const extras = sum(itemised.filter((l) => l.kind !== 'item').map((l) => l.amountMinor));
          fc.pre(items > 0n && items + extras - discount > 0n);
          const result = itemisedShares({
            members,
            payerId: uid(0),
            lines: [...itemised, { lineId: 'd', kind: 'discount', amountMinor: discount }],
          });
          expect(result.totalMinor).toBe(items + extras - discount);
          expect(sum(result.shares.map((share) => share.amountMinor))).toBe(result.totalMinor);
          expect(result.shares.every((share) => share.amountMinor >= 0n)).toBe(true);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it('crew-currency shares always sum to the converted total', () => {
    fc.assert(
      fc.property(
        total,
        weights,
        fc.integer({ min: 1, max: 99_999 }),
        fc.integer({ min: 0, max: 9_999 }),
        (amount, list, whole, fraction) => {
          const members = list.map((weight, index) => ({ userId: uid(index), weight }));
          const shares = computeExpenseShares({
            total: money(amount, 'IDR'),
            mode: 'weights',
            members,
            payerId: uid(0),
          });
          const crew = toCrewShares(
            money(amount, 'IDR'),
            shares,
            'USD',
            {
              snapshotId: 'run',
              snapshots: [
                {
                  base: 'USD',
                  quote: 'IDR',
                  rate: `${whole}.${fraction.toString().padStart(4, '0')}`,
                  asOf: '2026-10-01',
                  source: 'test',
                },
              ],
            },
            uid(0),
          );
          expect(sum(crew.shares.map((share) => share.amountMinor))).toBe(crew.total.amountMinor);
        },
      ),
      { numRuns: 1_000 },
    );
  });
});

describe('ledger properties', PROPERTY_SUITE_OPTIONS, () => {
  it('any mix of expenses and reversals nets to zero, and reversing everything clears it', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(total, weights, fc.nat(), fc.boolean()), { minLength: 1, maxLength: 12 }),
        (expenses) => {
          let seq = 0;
          const entries: StoredLedgerEntry[] = [];
          for (const [index, [amount, list, payerSeed, reverse]] of expenses.entries()) {
            const payerId = uid(payerSeed % list.length);
            const shares = computeExpenseShares({
              total: money(amount, 'USD'),
              mode: 'weights',
              members: list.map((weight, i) => ({ userId: uid(i), weight })),
              payerId,
            });
            const derived = deriveEntries({
              id: `e${index}`,
              crewId: 'crew',
              tripId: null,
              payerId,
              crewCurrency: 'USD',
              crewShares: shares,
            }).map((draft) => ({ ...draft, id: `x${(seq += 1)}` }));
            entries.push(...derived);
            if (reverse) {
              entries.push(
                ...reverseEntries(derived).map((draft) => ({ ...draft, id: `x${(seq += 1)}` })),
              );
            }
          }
          const nets = balances(entries, 'USD');
          expect(sum([...nets.values()])).toBe(0n);
          const live = entries.filter((entry) => entry.sourceKind !== 'reversal');
          const reversed = new Set(entries.map((entry) => entry.reversesId));
          const cleared = balances(
            [...entries, ...reverseEntries(live.filter((entry) => !reversed.has(entry.id)))],
            'USD',
          );
          expect([...cleared.values()].every((net) => net === 0n)).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });
});
