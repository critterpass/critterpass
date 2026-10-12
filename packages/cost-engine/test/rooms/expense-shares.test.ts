import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { roomSplitShares, type RoomSeat } from '../../src/rooms/expense-shares';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

const room = (key: string, nightly: number, stay = 'villa', nights = 4) => ({
  stay_key: stay,
  stay_type: 'villa',
  stay_nights: nights,
  key,
  capacity: 2,
  nightly_minor: nightly,
  label: key,
});
const seat = (room_key: string, user_id: string, stay_key = 'villa'): RoomSeat => ({
  stay_key,
  room_key,
  user_id,
});

describe('splitting a stay by room', () => {
  it('charges each guest their room, scaled to what the stay cost, adding up exactly', () => {
    // King 150/night shared by two, twin 100/night alone: 300 + 300 against 400 for 4 nights.
    const shares = roomSplitShares({
      amountMinor: 100_001n,
      currency: 'USD',
      rooms: [room('king', 15_000), room('twin', 10_000)],
      seats: [seat('king', 'a'), seat('king', 'b'), seat('twin', 'c')],
    });
    expect(shares).not.toBeNull();
    const by = new Map((shares ?? []).map((share) => [share.user_id, share.fixed_minor ?? 0]));
    expect([...by.values()].reduce((sum, value) => sum + value, 0)).toBe(100_001);
    expect(by.get('a')).toBeGreaterThanOrEqual(30_000);
    expect(by.get('c')).toBeGreaterThan(by.get('a') ?? 0);
  });

  it('follows the rooms: moving a guest changes the shares', () => {
    const base = {
      amountMinor: 60_000n,
      currency: 'USD' as const,
      rooms: [room('king', 15_000), room('twin', 10_000)],
    };
    const before = roomSplitShares({
      ...base,
      seats: [seat('king', 'a'), seat('king', 'b'), seat('twin', 'c')],
    });
    const after = roomSplitShares({
      ...base,
      seats: [seat('king', 'a'), seat('twin', 'b'), seat('twin', 'c')],
    });
    expect(before).not.toEqual(after);
    expect(after?.find((share) => share.user_id === 'a')?.fixed_minor).toBe(36_000);
  });

  it('keeps to one stay when asked, and gives up when nobody has a room', () => {
    const rooms = [room('king', 15_000), room('loft', 9_000, 'lodge', 2)];
    const seats = [seat('king', 'a'), seat('loft', 'b', 'lodge')];
    expect(
      roomSplitShares({ amountMinor: 1_000n, currency: 'USD', rooms, seats, stayKey: 'lodge' }),
    ).toEqual([{ user_id: 'b', fixed_minor: 1_000 }]);
    expect(roomSplitShares({ amountMinor: 1_000n, currency: 'USD', rooms, seats: [] })).toBeNull();
  });
});

describe('room split properties', PROPERTY_SUITE_OPTIONS, () => {
  it('shares are whole minor units that always sum to the expense', () => {
    const plan = fc.record({
      amount: fc.bigInt({ min: 1n, max: 100_000_000_000n }),
      rooms: fc.array(
        fc.record({
          nightly: fc.integer({ min: 1, max: 5_000_000 }),
          guests: fc.integer({ min: 0, max: 3 }),
        }),
        { minLength: 1, maxLength: 8 },
      ),
      nights: fc.integer({ min: 1, max: 30 }),
    });
    fc.assert(
      fc.property(plan, ({ amount, rooms, nights }) => {
        let next = 0;
        const seats: RoomSeat[] = [];
        const wire = rooms.map((spec, index) => {
          for (let g = 0; g < spec.guests; g += 1) {
            seats.push(seat(`r${index}`, `u${(next += 1).toString().padStart(3, '0')}`));
          }
          return room(`r${index}`, spec.nightly, 'villa', nights);
        });
        const shares = roomSplitShares({
          amountMinor: amount,
          currency: 'USD',
          rooms: wire,
          seats,
        });
        if (seats.length === 0) {
          expect(shares).toBeNull();
          return;
        }
        expect(shares).not.toBeNull();
        const values = (shares ?? []).map((share) => share.fixed_minor ?? -1);
        expect(values.every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
        expect(values.reduce((sum, value) => sum + BigInt(value), 0n)).toBe(amount);
        expect(new Set((shares ?? []).map((share) => share.user_id)).size).toBe(seats.length);
      }),
      { numRuns: 2_000 },
    );
  });
});
