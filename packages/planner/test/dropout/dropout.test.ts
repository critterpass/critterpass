import { dropout, stateShares, type TripCostState } from '@cp/cost-engine';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { buildDropoutChangeSet, costStateFromRows, skipOptions } from '../../src/dropout';

const uid = (n: number) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const seenAt = '2026-10-01T00:00:00.000Z';

const noExtras = (leaver: string) => ({
  leaver,
  attendedItems: [],
  reminderComponents: new Set<string>(),
  supplierSeats: [],
  affiliateStays: [],
});

const stateArb = fc
  .record({
    members: fc.integer({ min: 2, max: 8 }),
    group: fc.array(fc.bigInt({ min: 1n, max: 5_000_000n }), { minLength: 1, maxLength: 5 }),
    person: fc.array(fc.bigInt({ min: 1n, max: 500_000n }), { maxLength: 4 }),
  })
  .chain((shape) =>
    fc.record({
      shape: fc.constant(shape),
      leaver: fc.integer({ min: 1, max: shape.members }),
    }),
  )
  .map(({ shape, leaver }) => {
    const members = Array.from({ length: shape.members }, (_, i) => ({
      uid: uid(i + 1),
      origin: null,
    }));
    const state: TripCostState = {
      currency: 'USD',
      members,
      stays: [],
      components: [
        ...shape.group.map((amount, i) => ({
          id: `group:${i}`,
          kind: 'transfer' as const,
          unit: 'group' as const,
          amountMinor: amount,
          currency: 'USD' as const,
          source: 'user' as const,
          seenAt,
        })),
        ...shape.person.map((amount, i) => ({
          id: `person:${i}`,
          kind: 'activity' as const,
          unit: 'person' as const,
          amountMinor: amount,
          currency: 'USD' as const,
          source: 'user' as const,
          seenAt,
        })),
      ],
    };
    return { state, leaver: uid(leaver) };
  });

describe('dropout re-split', { timeout: 60_000 }, () => {
  it('keeps every shared cost whole: the remaining shares sum to the re-split total', () => {
    fc.assert(
      fc.property(stateArb, ({ state, leaver }) => {
        const built = buildDropoutChangeSet(state, noExtras(leaver));
        const after = stateShares(dropout(state, leaver).state);
        if (after.status !== 'ok') throw new Error('expected priced shares');
        const sum = built.members.reduce((total, m) => total + BigInt(m.after_minor), 0n);
        expect(sum).toBe(after.totalMinor);
        expect(built.totalAfterMinor).toBe(after.totalMinor);
        for (const component of state.components.filter((c) => c.unit === 'group')) {
          const paid = after.members
            .flatMap((m) => m.lines)
            .filter((line) => line.componentId === component.id)
            .reduce((total, line) => total + (line.amountMinor ?? 0n), 0n);
          expect(paid).toBe(component.amountMinor);
        }
        expect(built.members.map((m) => m.uid)).not.toContain(leaver);
        const resplit = built.ops.filter((op) => op.op === 'resplit_component');
        expect(resplit).toHaveLength(state.components.filter((c) => c.unit === 'group').length);
      }),
    );
  });

  it('cancels supplier seats, links third-party stays and never edits them', () => {
    const leaver = uid(2);
    const state = costStateFromRows({
      currency: 'USD',
      members: [1, 2, 3].map((n) => ({ uid: uid(n), origin: null })),
      rows: [
        {
          component_key: 'boat',
          kind: 'transfer',
          unit: 'group',
          member_ids: null,
          amount_minor: '90000',
          currency: 'USD',
          source: 'user',
          seen_at: seenAt,
          origin: null,
          label: 'Boat',
        },
      ],
    });
    const orderId = '0199a0f2-0000-7000-8000-00000000abcd';
    const bookingId = '0199a0f2-0000-7000-8000-00000000beef';
    const built = buildDropoutChangeSet(state, {
      ...noExtras(leaver),
      supplierSeats: [{ orderId, seats: 3 }],
      affiliateStays: [{ bookingId, supplier: 'agoda' }],
    });
    expect(built.ops).toEqual([
      { op: 'resplit_component', component_id: 'boat', ways_before: 3, ways_after: 2 },
      { op: 'cancel_supplier_item', supplier_order_id: orderId, seats_before: 3, seats_after: 2 },
      { op: 'change_stay_booking', booking_id: bookingId, supplier: 'agoda' },
    ]);
    expect(built.members.map((m) => [m.before_minor, m.after_minor])).toEqual([
      ['30000', '45000'],
      ['30000', '45000'],
    ]);
  });
});

describe('skip options', () => {
  it("prices only the viewer's own skippable items, biggest saving first", () => {
    const viewer = uid(1);
    const state = costStateFromRows({
      currency: 'USD',
      members: [1, 2].map((n) => ({ uid: uid(n), origin: null })),
      rows: [
        ['nara', 'activity', 'person', '6400'],
        ['kayak', 'activity', 'person', '12000'],
        ['food', 'food', 'person', '9000'],
        ['villa', 'stay', 'group', '80000'],
      ].map(([key, kind, unit, amount]) => ({
        component_key: key!,
        kind: kind!,
        unit: unit!,
        member_ids: null,
        amount_minor: amount!,
        currency: 'USD',
        source: 'user',
        seen_at: seenAt,
        origin: null,
        label: key!,
      })),
    });
    expect(skipOptions(state, viewer).map((o) => [o.id, o.deltaMinor])).toEqual([
      ['skip:kayak', -12000n],
      ['skip:nara', -6400n],
    ]);
    expect(skipOptions(state, uid(9))).toEqual([]);
  });
});
