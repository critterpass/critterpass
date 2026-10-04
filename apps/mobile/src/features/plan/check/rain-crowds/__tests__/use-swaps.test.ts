import { describe, expect, it } from '@jest/globals';
import type { ChangeSetOp } from '@cp/domain';

import type { SwapsAnswer } from '../../data/fixer-api';
import { mergeSwaps, tickedOps, toggled, weatherTurnedDown } from '../swap-choices';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const JATILUWIH = id(901);
const RIDGE = id(903);
const SPA = id(904);
const at = (time: string) => `2026-10-14T${time}:00+08:00`;
/** Bali time of an instant written as above. */
const clock = (instant: string) => instant.slice(11, 16);

const retime = (target: string, from: string, to: string): ChangeSetOp => ({
  op: 'retime',
  target,
  before: { starts_at: at(from) },
  after: { starts_at: at(to) },
  reason: 'check_fix',
  affected_user_ids: [],
  booking_impact: false,
});

const block = (stableId: string, start: string) => ({
  stableId,
  startsAt: at(start),
  endsAt: at(start),
  outdoor: false,
  problem: null,
});

const ANSWER: SwapsAnswer = {
  rain: { from: '13:00', to: '15:00', source: 'normals', recheckOn: '2026-10-11' },
  crowds: null,
  busyFrom: '10:00',
  now: [block(JATILUWIH, '09:00'), block(RIDGE, '14:00'), block(SPA, '16:00')],
  swapped: [],
  swaps: [
    { stableId: JATILUWIH, from: '09:00', to: '07:00', reason: 'quiet_before', withId: null },
    { stableId: RIDGE, from: '14:00', to: '16:30', reason: 'dry_after', withId: SPA },
    { stableId: SPA, from: '16:00', to: '14:00', reason: 'indoors_in_rain', withId: RIDGE },
  ],
  ops: [
    retime(JATILUWIH, '09:00', '07:00'),
    retime(RIDGE, '14:00', '16:30'),
    retime(SPA, '16:00', '14:00'),
  ],
  weather: null,
};

describe('rain and crowds swaps', () => {
  it('ticks every swap at first, and USE ALL applies them all', () => {
    const choices = mergeSwaps(ANSWER, clock);
    expect(choices.map((choice) => choice.stableId)).toEqual([JATILUWIH, RIDGE, SPA]);
    expect(tickedOps(choices, new Set()).map((op) => op.target)).toEqual([JATILUWIH, RIDGE, SPA]);
  });

  it('keeps an unticked block where it is, and ticks a trade’s two blocks together', () => {
    const choices = mergeSwaps(ANSWER, clock);
    expect(
      tickedOps(choices, toggled(choices, new Set(), JATILUWIH)).map((op) => op.target),
    ).toEqual([RIDGE, SPA]);
    const tradeOff = toggled(choices, new Set(), SPA);
    expect([...tradeOff].sort()).toEqual([RIDGE, SPA].sort());
    expect(tickedOps(choices, tradeOff).map((op) => op.target)).toEqual([JATILUWIH]);
    expect(toggled(choices, tradeOff, RIDGE).size).toBe(0);
  });

  it('shows the forecast’s weather move as the day’s swap for its block, over the check’s own', () => {
    const weather = { changeSetId: id(77), ops: [retime(RIDGE, '14:00', '11:00')] };
    const choices = mergeSwaps({ ...ANSWER, weather }, clock);
    expect(choices.map((choice) => [choice.stableId, choice.to, choice.source])).toEqual([
      [RIDGE, '11:00', 'weather'],
      [JATILUWIH, '07:00', 'check'],
    ]);
    expect(choices[0]?.reason).toBe('dry_before');
  });

  it('turns the forecast’s suggestion down only when all of it is unticked', () => {
    const weather = { changeSetId: id(77), ops: [retime(RIDGE, '14:00', '11:00')] };
    const choices = mergeSwaps({ ...ANSWER, weather }, clock);
    expect(weatherTurnedDown(choices, new Set())).toBe(false);
    expect(weatherTurnedDown(choices, toggled(choices, new Set(), RIDGE))).toBe(true);
    expect(weatherTurnedDown(mergeSwaps(ANSWER, clock), new Set([RIDGE, SPA]))).toBe(false);
  });
});
