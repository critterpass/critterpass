import { describe, expect, it } from '@jest/globals';
import type { StoredFit } from '@cp/domain';

import { balanceOf, type BalanceIdea } from '../model';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const WINSTON = id(1);
const DEV = id(2);
const MAYA = id(3);
const DAY = id(50);

const members = [
  { uid: WINSTON, name: 'Winston', joinIndex: 0 },
  { uid: DEV, name: 'Dev', joinIndex: 1 },
  { uid: MAYA, name: 'Maya', joinIndex: 2 },
];

const fit = (grade: 'good' | 'possible', needsMove: string | null = null): StoredFit => ({
  poi_id: null,
  best: {
    day_id: DAY,
    day_no: 2,
    grade,
    slot: { starts_at: '2026-10-14T16:00:00+08:00', ends_at: '2026-10-14T17:00:00+08:00' },
  },
  days: [
    {
      day_id: DAY,
      day_no: 2,
      grade,
      slot: { starts_at: '2026-10-14T16:00:00+08:00', ends_at: '2026-10-14T17:00:00+08:00' },
      reasons: [],
      needs_move: needsMove,
    },
  ],
  version_id: id(60),
  computed_at: '2026-10-04T00:00:00Z',
});

const idea = (
  n: number,
  backers: string[],
  f: StoredFit | null = null,
  poi = id(100 + n),
): BalanceIdea => ({
  id: id(200 + n),
  poiId: poi,
  name: `Place ${String(n)}`,
  backerIds: backers,
  fit: f,
});

describe('balance the crew', () => {
  const ideas = [
    idea(1, [WINSTON, MAYA]),
    idea(2, [WINSTON]),
    // Dev saved the same coffee place twice: one save.
    idea(3, [DEV], fit('good')),
    idea(4, [DEV], fit('good'), id(103)),
    idea(5, [DEV], fit('good', id(70))),
    idea(6, [DEV], fit('possible')),
  ];
  const input = {
    organiser: true,
    me: WINSTON,
    members,
    mustDos: [
      { id: id(300), ownerId: DEV, title: 'Babi guling', poiId: id(400), priority: 1 },
      { id: id(301), ownerId: MAYA, title: 'Karsa Spa', poiId: null, priority: 1 },
    ],
    items: [
      { poiId: id(101), mustDoId: null },
      { poiId: id(102), mustDoId: null },
      { poiId: id(400), mustDoId: null },
    ],
    ideas,
  };

  it('counts each place once per member, and how many made it into a day', () => {
    const balance = balanceOf(input);
    const dev = balance?.members.find((member) => member.uid === DEV);
    expect(dev).toMatchObject({ saved: 3, placed: 0 });
    expect(balance?.members.find((member) => member.uid === WINSTON)).toMatchObject({
      you: true,
      saved: 2,
      placed: 2,
    });
  });

  it('ticks a must-do only once it is in the plan', () => {
    const balance = balanceOf(input);
    expect(balance?.members.find((member) => member.uid === DEV)?.mustDo).toEqual({
      title: 'Babi guling',
      placed: true,
    });
    expect(balance?.members.find((member) => member.uid === MAYA)?.mustDo).toEqual({
      title: 'Karsa Spa',
      placed: false,
    });
    expect(balance?.mustDosIn).toBe(false);
  });

  it('offers someone at zero only the saves that fit without moving anything', () => {
    const dev = balanceOf(input)?.members.find((member) => member.uid === DEV);
    expect(dev?.fits.map((slot) => slot.ideaId)).toEqual([id(203)]);
    expect(dev?.missedIdeaIds).toHaveLength(3);
  });

  it('gives a member who is not an organiser nothing', () => {
    expect(balanceOf({ ...input, organiser: false })).toBeNull();
  });
});
