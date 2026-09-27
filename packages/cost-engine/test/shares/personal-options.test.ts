import { describe, expect, it } from 'vitest';

import {
  personalOptionDeltas,
  viewerQuote,
  viewerShareWithOptions,
} from '../../src/shares/personal-options';
import { applyCostOps, roomComponents, stateShares } from '../../src/shares/state';
import {
  ALEX,
  DRAFT,
  MAYA,
  RIN,
  SHARE_BIG_ROOM,
  SKIP_NARA,
  WINSTON,
  dollars,
} from '../golden/design-chain.fixture';

describe('draft golden', () => {
  it('prices Rin at $1,310 each', () => {
    expect(viewerQuote(DRAFT, RIN)).toEqual({
      share: dollars(1_310),
      displayShare: dollars(1_310),
      approximate: false,
    });
  });

  it('skipping Nara saves Rin $64; sharing the big room saves $140; together $1,106', () => {
    const deltas = personalOptionDeltas(DRAFT, RIN, [SHARE_BIG_ROOM, SKIP_NARA]);
    expect(deltas).toEqual([
      {
        optionId: 'share-big-room',
        delta: dollars(-140),
        displayDelta: dollars(-140),
        requires: [MAYA, 'u-jordan'],
      },
      { optionId: 'skip-nara', delta: dollars(-64), displayDelta: dollars(-64), requires: [] },
    ]);
    const options = [SHARE_BIG_ROOM, SKIP_NARA];
    expect(viewerShareWithOptions(DRAFT, RIN, options, ['share-big-room']).share).toEqual(
      dollars(1_170),
    );
    expect(viewerShareWithOptions(DRAFT, RIN, options, ['skip-nara']).share).toEqual(
      dollars(1_246),
    );
    expect(
      viewerShareWithOptions(DRAFT, RIN, options, ['share-big-room', 'skip-nara']).share,
    ).toEqual(dollars(1_106));
  });

  it("a viewer's option never changes anyone else's share", () => {
    const before = stateShares(DRAFT);
    const after = stateShares(applyCostOps(DRAFT, SKIP_NARA.ops));
    if (before.status !== 'ok' || after.status !== 'ok') throw new Error('expected shares');
    for (const member of before.members.filter((m) => m.uid !== RIN)) {
      expect(after.members.find((m) => m.uid === member.uid)?.totalMinor).toBe(member.totalMinor);
    }
  });

  it('a viewer who is not in the trip gets NOT_FOUND', () => {
    expect(() => viewerQuote(DRAFT, 'u-stranger')).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }) as Error,
    );
  });
});

describe('cost ops', () => {
  it('moves a guest between rooms and releases an emptied room', () => {
    const ryokan = DRAFT.stays[0];
    if (!ryokan) throw new Error('fixture');
    const moved = applyCostOps(DRAFT, [
      { op: 'move_room', stayId: 'ryokan', uid: WINSTON, roomKey: 'room-2' },
      { op: 'move_room', stayId: 'ryokan', uid: ALEX, roomKey: 'room-3' },
    ]);
    expect(moved.stays[0]?.rooms.find((r) => r.key === 'room-1')?.occupants).toEqual([]);
    expect(roomComponents(moved.stays[0] ?? ryokan).map((c) => c.id)).toEqual([
      'ryokan:room-2',
      'ryokan:room-3',
    ]);
    expect(() =>
      applyCostOps(moved, [{ op: 'move_room', stayId: 'ryokan', uid: MAYA, roomKey: 'room-2' }]),
    ).not.toThrow();
    expect(() =>
      applyCostOps(moved, [{ op: 'move_room', stayId: 'ryokan', uid: ALEX, roomKey: 'room-2' }]),
    ).toThrow(expect.objectContaining({ code: 'STATE_INVALID' }) as Error);
  });

  it('splits a per-room price between occupants', () => {
    const ryokan = DRAFT.stays[0];
    if (!ryokan) throw new Error('fixture');
    const [first] = roomComponents({ ...ryokan, pricing: 'per_room' });
    expect(first).toMatchObject({ unit: 'room', amountMinor: 30_000n, memberIds: [WINSTON, ALEX] });
  });

  it('sets, adds and removes components', () => {
    const edited = applyCostOps(DRAFT, [
      { op: 'set_amount', componentId: 'fun', amountMinor: 5_000n },
      { op: 'remove_component', componentId: 'museum-lottery' },
      {
        op: 'add_component',
        component: {
          id: 'extra',
          kind: 'fun',
          unit: 'person',
          amountMinor: 1n,
          currency: 'USD',
          source: 'user',
          seenAt: '2027-02-01T00:00:00.000Z',
        },
      },
    ]);
    expect(edited.components.map((c) => c.id)).toContain('extra');
    expect(edited.components.map((c) => c.id)).not.toContain('museum-lottery');
    expect(() => applyCostOps(DRAFT, [{ op: 'remove_component', componentId: 'nope' }])).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }) as Error,
    );
  });
});
