/**
 * The swap cards of a voice turn: a change set's cost sits on its card only when the set holds
 * that one change, a set with several changes gives one cost line instead, and the group button
 * is offered while any set is unsent.
 */
import { describe, expect, it } from '@jest/globals';

import type { PlanCardModel, PlanSwap } from '../../chat/data/use-plan-card';
import { groupStatus, voiceSwaps } from '../voice-swaps';

const swap = (label: string, reason = ''): PlanSwap => ({
  target: label,
  op: 'swap',
  before: { label: 'Beach walk', time: '14:00' },
  after: { label, time: '14:00' },
  reason,
});

const model = (over: Partial<PlanCardModel>): PlanCardModel => ({
  changesetId: 'cs-1',
  tripId: 'trip',
  state: 'draft',
  eachMinor: 1800,
  currency: 'USD',
  swaps: [swap('Cooking class', 'Indoors')],
  driverPicks: [],
  ...over,
});

const cost = (card: PlanCardModel) =>
  card.eachMinor === null || card.eachMinor === 0 ? null : `+$${card.eachMinor / 100}`;

describe('voice swap cards', () => {
  it('puts the cost on the card of a change set with one change', () => {
    expect(voiceSwaps([model({})], cost)).toEqual({
      swaps: [{ id: 'cs-1-0', title: 'Cooking class', detail: 'Indoors', delta: '+$18' }],
      costs: [],
    });
  });

  it('gives one cost line, not a price per card, for a set with several changes', () => {
    const cards = voiceSwaps(
      [model({ swaps: [swap('Cooking class'), swap('Museum')], eachMinor: 2200 })],
      cost,
    );
    expect(cards.swaps.map((card) => card.delta)).toEqual([null, null]);
    expect(cards.costs).toEqual(['+$22']);
  });

  it('shows no price when nobody pays more or less', () => {
    expect(voiceSwaps([model({ eachMinor: 0 })], cost).swaps[0]?.delta).toBeNull();
  });

  it('names a removal by what goes', () => {
    const removed = voiceSwaps([model({ swaps: [{ ...swap('x'), after: null }] })], cost);
    expect(removed.swaps[0]?.title).toBe('Beach walk');
  });
});

describe('sending to the group', () => {
  it('is offered while a change set is unsent, then reads as sent', () => {
    expect(groupStatus([model({ state: 'voting' }), model({ changesetId: 'cs-2' })])).toBe('open');
    expect(groupStatus([model({ state: 'voting' })])).toBe('sent');
    expect(groupStatus([model({ state: 'rejected' })])).toBeNull();
    expect(groupStatus([])).toBeNull();
  });
});
