import { describe, expect, it } from 'vitest';

import { dropout } from '../../src/resplit/dropout';
import { viewerQuote } from '../../src/shares/personal-options';
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

describe('dropout golden', () => {
  const result = dropout(DRAFT, DEV);

  it("Dev's out: Rin goes $1,310 → $1,334, +$24 each", () => {
    const rin = result.members.find((m) => m.uid === RIN);
    expect(rin).toEqual({
      uid: RIN,
      before: dollars(1_310),
      after: dollars(1_334),
      delta: dollars(24),
      displayDelta: dollars(24),
    });
    expect(result.members.every((m) => m.delta.amountMinor === 2_400n)).toBe(true);
    expect(result.members.map((m) => m.uid)).not.toContain(DEV);
  });

  it('lists the room released, Jordan joining Winston and Alex, the 6 → 5 split and the withdrawn entries', () => {
    expect(result.changes).toEqual([
      { kind: 'guest_moved', stayId: 'ryokan', uid: JORDAN, fromRoom: 'room-3', toRoom: 'room-1' },
      {
        kind: 'room_released',
        stayId: 'ryokan',
        roomKey: 'room-3',
        occupantsBefore: [JORDAN, DEV],
      },
      { kind: 'entry_withdrawn', componentId: 'draft-flight-KUL', uid: DEV },
      { kind: 'split_changed', componentId: 'apartment', ways: { before: 6, after: 5 } },
      { kind: 'entry_withdrawn', componentId: 'nara-day', uid: DEV },
      { kind: 'entry_withdrawn', componentId: 'museum-lottery', uid: DEV },
    ]);
    expect(result.state.stays[0]?.rooms.map((r) => r.occupants)).toEqual([
      [WINSTON, ALEX, JORDAN],
      [MAYA, RIN],
      [],
    ]);
    expect(viewerQuote(result.state, RIN).share).toEqual(dollars(1_334));
  });

  it('rejects the last member and an unknown member with typed errors', () => {
    const solo: TripCostState = { ...DRAFT, members: [{ uid: RIN, origin: 'SIN' }] };
    expect(() => dropout(solo, RIN)).toThrow(
      expect.objectContaining({ code: 'STATE_INVALID' }) as Error,
    );
    expect(() => dropout(DRAFT, 'u-nobody')).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }) as Error,
    );
  });

  it('drops the leaver from restricted components', () => {
    const withPersonal = dropout(DRAFT, RIN);
    const ownRoom = withPersonal.state.components.find((c) => c.id === 'apartment-own-room');
    expect(ownRoom?.memberIds).toEqual([]);
    expect(withPersonal.changes).toContainEqual({
      kind: 'entry_withdrawn',
      componentId: 'apartment-own-room',
      uid: RIN,
    });
  });
});
