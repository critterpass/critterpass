import { describe, expect, it } from 'vitest';

import { packRooms, previewSwap, repackWithout } from '../../src/rooms/pack';
import { type TripCostState } from '../../src/shares/state';
import {
  ALEX,
  DEV,
  DRAFT,
  JORDAN,
  MAYA,
  RIN,
  WINSTON,
  dollars,
} from '../golden/design-chain.fixture';

describe('packRooms', () => {
  it('keeps trait groups together, largest group first, in the roomiest room', () => {
    const rooms = packRooms(
      [
        { uid: RIN, trait: 'light sleeper' },
        { uid: MAYA, trait: 'light sleeper' },
        { uid: JORDAN, trait: 'night owl' },
        { uid: WINSTON },
        { uid: ALEX },
      ],
      [
        { key: 'a', capacity: 2 },
        { key: 'b', capacity: 3 },
      ],
    );
    expect(rooms.map((r) => [r.key, r.occupants])).toEqual([
      ['a', [JORDAN, ALEX]],
      ['b', [MAYA, RIN, WINSTON]],
    ]);
  });

  it('refuses more guests than beds', () => {
    expect(() => packRooms([{ uid: 'a' }, { uid: 'b' }], [{ key: 'x', capacity: 1 }])).toThrow(
      expect.objectContaining({ code: 'STATE_INVALID' }) as Error,
    );
  });
});

describe('repackWithout', () => {
  const ryokan = DRAFT.stays[0];
  if (!ryokan) throw new Error('fixture');

  it('moves a guest left alone and releases the empty room', () => {
    const result = repackWithout(ryokan, DEV);
    expect(result.moves).toEqual([{ uid: JORDAN, from: 'room-3', to: 'room-1' }]);
    expect(result.released).toEqual([{ roomKey: 'room-3', occupantsBefore: [JORDAN, DEV] }]);
  });

  it('leaves a guest alone when no other room has space', () => {
    const full = {
      ...ryokan,
      rooms: ryokan.rooms.map((r) => ({ ...r, capacity: 2 })),
    };
    expect(repackWithout(full, DEV).moves).toEqual([]);
  });
});

describe('previewSwap', () => {
  it('shows who pays more or less when a per-room stay swaps guests', () => {
    const state: TripCostState = {
      ...DRAFT,
      stays: [
        {
          ...DRAFT.stays[0]!,
          pricing: 'per_room',
          nightlyMinor: 12_000n,
          rooms: [
            { key: 'big', capacity: 3, occupants: [WINSTON, ALEX, JORDAN] },
            { key: 'small', capacity: 2, occupants: [MAYA, RIN, DEV].slice(0, 2) },
          ],
        },
      ],
    };
    // Rin into the big room (3 sharing $240) and Jordan into the small one (2 sharing $240).
    expect(previewSwap(state, 'ryokan', RIN, JORDAN)).toEqual([
      { uid: RIN, delta: dollars(-40) },
      { uid: JORDAN, delta: dollars(40) },
    ]);
    expect(previewSwap(state, 'ryokan', WINSTON, ALEX)).toEqual([]);
    expect(() => previewSwap(state, 'ryokan', RIN, 'u-nobody')).toThrow();
  });
});
