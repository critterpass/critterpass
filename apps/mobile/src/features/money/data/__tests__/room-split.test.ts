import { describe, expect, it } from '@jest/globals';

import { roomSplitShares, type RoomSeat } from '../room-split';

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
    const by = new Map(shares!.map((share) => [share.user_id, share.fixed_minor]));
    expect([...by.values()].reduce((sum, value) => sum + (value ?? 0), 0)).toBe(100_001);
    expect(by.get('a')).toBeGreaterThanOrEqual(30_000);
    expect(by.get('c')).toBeGreaterThan(by.get('a')!);
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
