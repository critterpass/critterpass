/**
 * The overview's model over the Bali week: chips (booked beats vote beats weather), summaries,
 * the reorder a drop becomes (with booked days refusing to move), a queued reorder read back from
 * the outbox, the guide changes still to sweep, and a member's reorder as change set moves.
 */

import { describe, expect, it } from '@jest/globals';

import { pendingOrder } from '../data/use-day-reorder';
import { unseenChanges } from '../data/use-guide-sweep';
import {
  BALI_DAYS,
  BALI_ITEMS,
  BALI_POLLS,
  BALI_VERSION,
  BALI_WEATHER,
  MAYA,
  RIN,
} from '../dev/bali-plan';
import { buildDayCards, guideTouchedDays, rowKeys, toPlanState } from '../model/plan-model';
import {
  moveInOrder,
  movedFixedDay,
  reorderChangeSetOps,
  reorderedPlan,
  reorderPlanOp,
} from '../model/reorder';

const cards = buildDayCards({
  days: BALI_DAYS,
  items: BALI_ITEMS,
  polls: BALI_POLLS,
  weather: BALI_WEATHER,
  today: null,
});

describe('day cards', () => {
  it('derive each day’s chip and summary as the design shows them', () => {
    expect(cards.map((card) => card.chip)).toEqual([
      { kind: 'booked' },
      { kind: 'vote', pollId: BALI_POLLS[0]?.id, ballots: 1 },
      { kind: 'weather', icon: 'rain' },
      { kind: 'booked' },
      { kind: 'vote', pollId: BALI_POLLS[1]?.id, ballots: 0 },
      { kind: 'weather', icon: 'sun' },
      { kind: 'weather', icon: 'wave' },
    ]);
    expect(cards[0]?.summary).toEqual(['Driver 11:40', 'Villa check-in 15:00']);
    expect(cards[3]?.summary).toEqual(['Pickup 03:30', 'Hot springs']);
    expect(cards[5]?.summary).toEqual([]);
    expect(cards.map((card) => card.fixed)).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('mark past days and today once the trip is under way', () => {
    const during = buildDayCards({
      days: BALI_DAYS,
      items: BALI_ITEMS,
      polls: [],
      weather: [],
      today: '2026-11-04',
    });
    expect(during.map((card) => card.when)).toEqual([
      'past',
      'past',
      'today',
      'future',
      'future',
      'future',
      'future',
    ]);
  });

  it('keep row keys unique for plan-less days', () => {
    const free = [
      { ...cards[5]!, key: 'day:6' },
      { ...cards[5]!, key: 'day:6' },
    ];
    expect(rowKeys(free)).toEqual(['day:6', 'day:6#1']);
  });
});

describe('reorder', () => {
  const current = [1, 2, 3, 4, 5, 6, 7];
  const fixed = new Set([1, 4]);

  it('moves a day and refuses any order that shifts a booked day', () => {
    expect(moveInOrder(current, 1, 2)).toEqual([1, 3, 2, 4, 5, 6, 7]);
    expect(movedFixedDay(current, moveInOrder(current, 1, 2), fixed)).toBeNull();
    // Dragging day 3 past day 4 slides the booked day up a slot.
    expect(movedFixedDay(current, moveInOrder(current, 2, 4), fixed)).toBe(4);
    expect(movedFixedDay(current, moveInOrder(current, 0, 1), fixed)).toBe(1);
  });

  it('shows a queued reorder with every day’s plan on its new date', () => {
    const order = [1, 3, 2, 4, 5, 6, 7];
    const plan = reorderedPlan(BALI_DAYS, BALI_ITEMS, order);
    expect(plan.days.map((day) => day.theme).slice(0, 3)).toEqual([
      'Arrive + pool',
      'Slow Ubud',
      'Ubud centre',
    ]);
    const ridge = plan.items.find((item) => item.label === 'Ridge walk');
    expect(ridge?.dayNo).toBe(2);
  });

  it('reads the newest queued reorder made on the version on screen', () => {
    const envelope = (base: string, order: number[]) =>
      JSON.stringify({ payload: { base_version: base, ops: [reorderPlanOp(order)] } });
    const rows = [
      { id: 'a', envelope: envelope(BALI_VERSION, [2, 1, 3]) },
      { id: 'b', envelope: envelope('older-version', [3, 2, 1]) },
      { id: 'c', envelope: envelope(BALI_VERSION, [1, 3, 2]) },
    ];
    expect(pendingOrder(rows, BALI_VERSION)).toEqual([1, 3, 2]);
    expect(pendingOrder(rows, 'another')).toBeNull();
  });

  it('turns a member’s reorder into moves for the people on each moved item', () => {
    const state = toPlanState(BALI_DAYS, BALI_ITEMS);
    const ops = reorderChangeSetOps(state, [1, 3, 2, 4, 5, 6, 7], 'Days swapped around.');
    expect(ops.map((op) => [op.target, op.before?.day_no, op.after?.day_no])).toEqual(
      expect.arrayContaining([
        [BALI_ITEMS.find((i) => i.label === 'Monkey Forest')?.stableId, 2, 3],
        [BALI_ITEMS.find((i) => i.label === 'Spa')?.stableId, 3, 2],
      ]),
    );
    expect(ops).toHaveLength(5);
    const spa = ops.find((op) => op.before?.day_no === 3 && op.affected_user_ids.length === 2);
    expect(spa?.affected_user_ids).toEqual([MAYA, RIN]);
    // Moving a day a day earlier moves its times a day earlier too.
    const ridge = ops.find(
      (op) => op.target === BALI_ITEMS.find((i) => i.label === 'Ridge walk')?.stableId,
    );
    expect(
      Date.parse(ridge?.before?.starts_at ?? '') - Date.parse(ridge?.after?.starts_at ?? ''),
    ).toBe(24 * 60 * 60 * 1000);
  });
});

describe('guide sweep', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const changes = [
    {
      id: 'new',
      ops: JSON.stringify([{ target: BALI_ITEMS[4]?.stableId }]),
      updated_at: '2026-10-20 11:00:00Z',
    },
    {
      id: 'old',
      ops: JSON.stringify([{ target: BALI_ITEMS[0]?.stableId }]),
      updated_at: '2026-10-10T11:00:00Z',
    },
  ];

  it('sweeps only changes after the seen marker (the last day’s before any)', () => {
    expect(unseenChanges(changes, null, now).map((row) => row.id)).toEqual(['new']);
    expect(unseenChanges(changes, '2026-10-01T00:00:00Z', now).map((row) => row.id)).toEqual([
      'new',
      'old',
    ]);
    expect(unseenChanges(changes, '2026-10-20T11:00:00Z', now)).toEqual([]);
  });

  it('names the days a guide change touched', () => {
    expect([...guideTouchedDays(unseenChanges(changes, null, now), BALI_ITEMS)]).toEqual([3]);
  });
});
