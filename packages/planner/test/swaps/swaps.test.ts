import { describe, expect, it } from 'vitest';

import { checkPlan, swapDay } from '../../src/check/index';
import { at } from '../fit/bali-fixture';
import {
  JATILUWIH,
  OCTOBER_RAIN,
  RIDGE,
  SPA,
  WEDNESDAY,
  WEDNESDAY_ITEMS,
  wednesdayDay,
  wednesdayInput,
} from './wednesday-fixture';

describe('rain and crowds on Wednesday', () => {
  const swaps = swapDay(wednesdayInput(), WEDNESDAY);

  it('swaps three blocks: the terraces before the buses, the ridge after the rain, the spa into it', () => {
    expect(swaps?.swaps).toEqual([
      { stableId: JATILUWIH, from: 9 * 60, to: 7 * 60, reason: 'quiet_before', withId: null },
      { stableId: RIDGE, from: 14 * 60, to: 16 * 60 + 30, reason: 'dry_after', withId: SPA },
      { stableId: SPA, from: 16 * 60, to: 14 * 60, reason: 'indoors_in_rain', withId: RIDGE },
    ]);
    expect(swaps?.ops.map((op) => [op.target, op.after?.starts_at])).toEqual([
      [JATILUWIH, at(14, '07:00').toISOString()],
      [RIDGE, at(14, '16:30').toISOString()],
      [SPA, at(14, '14:00').toISOString()],
    ]);
  });

  it('gives the chart its rain band, crowd bars and both lanes', () => {
    expect(swaps?.rain).toEqual({ from: 13 * 60, to: 15 * 60, source: 'normals' });
    expect(swaps?.crowds?.source).toBe('editorial');
    expect(swaps?.crowds?.hourly[10]).toBe(90);
    expect(swaps?.busyFrom).toBe(10 * 60);
    const problems = swaps?.now.map((block) => [block.stableId, block.problem]);
    expect(problems).toContainEqual([JATILUWIH, 'crowds']);
    expect(problems).toContainEqual([RIDGE, 'rain']);
    expect(swaps?.swapped.find((block) => block.stableId === RIDGE)?.start).toBe(16 * 60 + 30);
    expect(swaps?.swapped.every((block) => block.problem === null)).toBe(true);
  });

  it('opens the rain and crowds screen from the rain issue', () => {
    const rain = checkPlan(wednesdayInput()).find((issue) => issue.kind === 'rain');
    expect(rain?.fix).toEqual({ kind: 'screen', screen: 'rain_crowds' });
  });

  it('offers nothing for a wet block that has nowhere dry to go', () => {
    const allWet = {
      ...wednesdayDay(),
      rain: { hourly: OCTOBER_RAIN.map(() => 80), source: 'forecast' as const },
    };
    const result = swapDay(wednesdayInput(allWet), WEDNESDAY);
    expect(result?.swaps.some((swap) => swap.stableId === RIDGE)).toBe(false);
    const rain = checkPlan(wednesdayInput(allWet)).find((issue) => issue.kind === 'rain');
    expect(rain?.fix).toEqual({ kind: 'none' });
  });

  it('never moves a booked block', () => {
    const locked = WEDNESDAY_ITEMS.map((item) => ({ ...item, locked: true }));
    expect(swapDay(wednesdayInput(wednesdayDay(locked)), WEDNESDAY)?.swaps).toEqual([]);
  });
});
