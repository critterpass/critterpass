import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { groupRooms, type RoomGuest, type RoomSpace } from '../../src/rooms/group';
import { splitStay, splitStays } from '../../src/rooms/split';
import {
  ALEX,
  DEV,
  JORDAN,
  MAYA,
  RIN,
  WINSTON,
  USD,
  dollars,
} from '../golden/design-chain.fixture';
import { PROPERTY_SUITE_OPTIONS } from '../property-budget';

const DOUBLES: readonly RoomSpace[] = [
  { key: 'room-1', capacity: 2 },
  { key: 'room-2', capacity: 2 },
  { key: 'room-3', capacity: 2 },
];

describe('room grouping (3c-6)', () => {
  it('puts the light sleepers, the early risers and the night owls together', () => {
    const guests: RoomGuest[] = [
      { uid: MAYA, chips: ['light_sleeper'] },
      { uid: RIN, chips: ['light_sleeper'] },
      { uid: WINSTON, chronotype: 'early' },
      { uid: ALEX, chips: ['dont_care'] },
      { uid: JORDAN, chips: ['night_owl'] },
      { uid: DEV, chips: ['dont_care'] },
    ];
    const rooms = groupRooms(guests, DOUBLES);
    expect(rooms.map((r) => [r.key, [...r.occupants].sort(), r.label])).toEqual([
      ['room-1', [MAYA, RIN].sort(), 'light_sleepers'],
      ['room-2', [ALEX, WINSTON].sort(), 'early_risers'],
      ['room-3', [DEV, JORDAN].sort(), 'night_owls'],
    ]);
  });

  it('puts a couple in one room first and keeps a snorer away from light sleepers', () => {
    const rooms = groupRooms(
      [
        { uid: 'a', partnerId: 'b' },
        { uid: 'b' },
        { uid: 'c', chips: ['light_sleeper'] },
        { uid: 'd', chips: ['snorer'] },
      ],
      [
        { key: 'x', capacity: 2 },
        { key: 'y', capacity: 1 },
        { key: 'z', capacity: 1 },
      ],
    );
    expect(rooms.find((r) => r.label === 'couple')?.occupants).toEqual(['a', 'b']);
    const withC = rooms.find((r) => r.occupants.includes('c'));
    expect(withC?.occupants.includes('d')).toBe(false);
  });

  it('gives an odd crew a valid plan, and too many guests a capacity error', () => {
    const five = [RIN, MAYA, ALEX, JORDAN, DEV].map((uid) => ({ uid }));
    const rooms = groupRooms(five, DOUBLES);
    expect(rooms.flatMap((r) => r.occupants).sort()).toEqual([...five.map((g) => g.uid)].sort());
    expect(rooms.every((r) => r.occupants.length <= r.capacity)).toBe(true);
    const seven = [...five, { uid: WINSTON }, { uid: 'u-extra' }];
    expect(() => groupRooms(seven, DOUBLES)).toThrow(
      expect.objectContaining({ code: 'STATE_INVALID' }) as Error,
    );
  });
});

describe('room grouping properties', PROPERTY_SUITE_OPTIONS, () => {
  const chip = fc.constantFrom('early_bird', 'night_owl', 'light_sleeper', 'snorer', 'dont_care');
  it('seats everyone exactly once within capacity, or refuses', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(chip, { maxLength: 2 }), { minLength: 1, maxLength: 16 }),
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 8 }),
        (chips, capacities) => {
          const guests = chips.map((c, i) => ({ uid: `g${String(i).padStart(2, '0')}`, chips: c }));
          const spaces = capacities.map((capacity, i) => ({ key: `r${i}`, capacity }));
          const beds = capacities.reduce((a, b) => a + b, 0);
          if (guests.length > beds) {
            expect(() => groupRooms(guests, spaces)).toThrow();
            return;
          }
          const rooms = groupRooms(guests, spaces);
          const seated = rooms.flatMap((r) => r.occupants);
          expect(seated.sort()).toEqual(guests.map((g) => g.uid).sort());
          for (const room of rooms)
            expect(room.occupants.length).toBeLessThanOrEqual(room.capacity);
          expect(groupRooms(guests, spaces)).toEqual(rooms);
        },
      ),
    );
  });
});

describe('room price split', () => {
  const ryokan = {
    key: 'ryokan',
    nights: 2,
    currency: USD,
    rooms: [
      { key: 'room-1', nightlyMinor: 22_000n, occupants: [MAYA, RIN] },
      { key: 'room-2', nightlyMinor: 22_000n, occupants: [WINSTON, ALEX] },
      { key: 'room-3', nightlyMinor: 22_000n, occupants: [JORDAN, DEV] },
    ],
  };
  const apartment = {
    key: 'apartment',
    nights: 5,
    currency: USD,
    rooms: ryokan.rooms.map((room) => ({ ...room, nightlyMinor: 10_000n })),
  };

  it('comes to $470 each for two ryokan nights and five apartment nights', () => {
    const split = splitStays([ryokan, apartment]);
    for (const uid of [MAYA, RIN, WINSTON, ALEX, JORDAN, DEV]) {
      expect(split.perGuest.get(uid)).toEqual(dollars(470));
    }
    expect(split.total).toEqual(dollars(2_820));
  });

  it('charges unequal rooms unequally and adds back to what the rooms cost', () => {
    const split = splitStay({
      key: 's',
      nights: 3,
      currency: USD,
      rooms: [
        { key: 'big', nightlyMinor: 30_001n, occupants: ['a', 'b', 'c'] },
        { key: 'small', nightlyMinor: 9_000n, occupants: ['d'] },
        { key: 'empty', nightlyMinor: 50_000n, occupants: [] },
      ],
    });
    expect(split.perGuest.get('d')).toEqual({ amountMinor: 27_000n, currency: USD });
    const big = ['a', 'b', 'c'].map((uid) => split.perGuest.get(uid)?.amountMinor ?? 0n);
    expect(big.reduce((a, b) => a + b, 0n)).toBe(90_003n);
    expect(split.total.amountMinor).toBe(90_003n + 27_000n);
  });
});
