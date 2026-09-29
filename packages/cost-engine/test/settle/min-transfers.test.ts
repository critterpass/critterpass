/**
 * Settling up: the Bali Six balances settle in exactly the three payments the settle screen shows,
 * every plan brings every balance to zero with positive transfers, and no plan ever uses more
 * transfers than the best partition into zero-sum groups allows (checked exhaustively for small
 * crews).
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { minTransfers, settlePlan, staleRequests, type MemberNet } from '../../src/settle';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

const net = (userId: string, netMinor: bigint): MemberNet => ({ userId, netMinor });

describe('the Bali Six settle plan', () => {
  it('nets +186.40 / +41.00 / 0 / −41.00 / −92.10 / −94.30 down to three payments', () => {
    const plan = minTransfers([
      net('you', 18_640n),
      net('maya', 4_100n),
      net('dev', 0n),
      net('rin', -4_100n),
      net('jordan', -9_210n),
      net('alex', -9_430n),
    ]);
    expect(plan).toHaveLength(3);
    expect(plan).toEqual(
      expect.arrayContaining([
        { fromId: 'rin', toId: 'maya', amountMinor: 4_100n },
        { fromId: 'alex', toId: 'you', amountMinor: 9_430n },
        { fromId: 'jordan', toId: 'you', amountMinor: 9_210n },
      ]),
    );
  });

  it('counts a payment already marked paid as made, and re-issues a request it made stale', () => {
    const nets = [net('you', 18_640n), net('jordan', -9_210n), net('alex', -9_430n)];
    const open = [
      {
        id: 'p1',
        fromId: 'alex',
        toId: 'you',
        amountMinor: 9_430n,
        status: 'marked_paid' as const,
      },
      {
        id: 'p2',
        fromId: 'jordan',
        toId: 'you',
        amountMinor: 5_000n,
        status: 'requested' as const,
      },
    ];
    const plan = settlePlan(nets, open);
    expect(plan).toEqual([{ fromId: 'jordan', toId: 'you', amountMinor: 9_210n }]);
    expect(staleRequests(plan, open)).toEqual([{ paymentId: 'p2', amountMinor: 9_210n }]);
    expect(staleRequests([], open)).toEqual([{ paymentId: 'p2', amountMinor: null }]);
  });
});

/** The most disjoint zero-sum groups the members split into, by trying every set partition. */
function bestGroups(values: readonly bigint[]): number {
  let best = 0;
  const assign = (index: number, groups: bigint[]) => {
    if (index === values.length) {
      if (groups.every((sum) => sum === 0n)) best = Math.max(best, groups.length);
      return;
    }
    const value = values[index] ?? 0n;
    for (let g = 0; g < groups.length; g += 1) {
      const next = [...groups];
      next[g] = (next[g] ?? 0n) + value;
      assign(index + 1, next);
    }
    assign(index + 1, [...groups, value]);
  };
  assign(0, []);
  return best;
}

/** Random balances that sum to zero: the last member takes the negated sum of the others. */
const balances = (max: number) =>
  fc
    .array(fc.bigInt({ min: -50_000n, max: 50_000n }), { minLength: 1, maxLength: max })
    .map((values) => [...values, -values.reduce((sum, value) => sum + value, 0n)]);

function applies(nets: readonly MemberNet[], plan: ReturnType<typeof minTransfers>): void {
  const left = new Map(nets.map((m) => [m.userId, m.netMinor]));
  for (const transfer of plan) {
    expect(transfer.amountMinor > 0n).toBe(true);
    left.set(transfer.fromId, (left.get(transfer.fromId) ?? 0n) + transfer.amountMinor);
    left.set(transfer.toId, (left.get(transfer.toId) ?? 0n) - transfer.amountMinor);
  }
  expect([...left.values()].every((value) => value === 0n)).toBe(true);
}

describe('settle plan properties', PROPERTY_SUITE_OPTIONS, () => {
  it('always settles everyone, in the fewest transfers a partition allows', () => {
    fc.assert(
      fc.property(balances(6), (values) => {
        const nets = values.map((value, index) => net(`m${index}`, value));
        const plan = minTransfers(nets);
        applies(nets, plan);
        const open = values.filter((value) => value !== 0n);
        expect(plan.length).toBe(open.length - bestGroups(open));
      }),
      { numRuns: 300 },
    );
  });

  it('settles a full crew of sixteen in at most fifteen transfers, the same way every time', () => {
    fc.assert(
      fc.property(balances(15), (values) => {
        const nets = values.map((value, index) => net(`m${index}`, value));
        const plan = minTransfers(nets);
        applies(nets, plan);
        expect(plan.length).toBeLessThanOrEqual(Math.max(0, values.length - 1));
        expect(minTransfers(nets)).toEqual(plan);
      }),
      { numRuns: 50 },
    );
  });
});
