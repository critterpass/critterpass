import { describe, expect, it } from 'vitest';

import { checkPlan, reorderDay } from '../../src/check/index';
import { at } from '../fit/bali-fixture';
import {
  COOKING,
  DINNER,
  FOREST,
  MARKET,
  SARASWATI,
  TUESDAY,
  TUESDAY_ITEMS,
  tuesdayDay,
  tuesdayInput,
} from './tuesday-fixture';

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

describe('less driving on Tuesday', () => {
  const reorder = reorderDay(tuesdayInput(), TUESDAY);

  it('goes from 2h10 to 1h05 in the car with the booked class where it was', () => {
    expect(reorder?.before.driveMin).toBe(130);
    expect(reorder?.after.driveMin).toBe(65);
    expect(reorder?.after.order).toEqual([COOKING, FOREST, MARKET, SARASWATI, DINNER]);
    expect(reorder?.locked).toEqual([COOKING]);
    const times = reorder?.after.schedule.map((slot) => [slot.stableId, clock(slot.start)]);
    expect(times).toEqual([
      [COOKING, '09:00'],
      [FOREST, '13:30'],
      [MARKET, '15:00'],
      [SARASWATI, '16:00'],
      [DINNER, '19:00'],
    ]);
  });

  it('says where each moved stop used to be and retimes only those', () => {
    expect(reorder?.was).toEqual([
      { stableId: FOREST, position: 2, start: 12 * 60 },
      { stableId: MARKET, position: 4, start: 15 * 60 },
      { stableId: SARASWATI, position: 3, start: 14 * 60 },
    ]);
    expect(reorder?.ops.map((op) => [op.target, op.after?.starts_at])).toEqual([
      [FOREST, at(13, '13:30').toISOString()],
      [SARASWATI, at(13, '16:00').toISOString()],
    ]);
    expect(reorder?.ops.every((op) => op.op === 'retime')).toBe(true);
  });

  it('opens the less driving screen from the clash it also clears', () => {
    const clash = checkPlan(tuesdayInput()).find((issue) => issue.kind === 'clash');
    expect(clash?.fix).toEqual({ kind: 'screen', screen: 'less_driving' });
  });

  it('keeps a dinner inside the dinner window', () => {
    const early = TUESDAY_ITEMS.map((item) =>
      item.stableId === DINNER
        ? { ...item, startsAt: at(13, '18:30'), endsAt: at(13, '20:00') }
        : item,
    );
    const result = reorderDay(tuesdayInput(tuesdayDay(early)), TUESDAY);
    const dinner = result?.after.schedule.find((slot) => slot.stableId === DINNER);
    expect(dinner?.start).toBeGreaterThanOrEqual(18 * 60 + 30);
    expect(dinner?.start).toBeLessThan(22 * 60);
  });

  it('offers nothing when no order is shorter', () => {
    const best = TUESDAY_ITEMS.map((item) => {
      const slot = reorder?.after.schedule.find((entry) => entry.stableId === item.stableId);
      return slot === undefined
        ? item
        : { ...item, startsAt: at(13, clock(slot.start)), endsAt: at(13, clock(slot.end)) };
    });
    expect(reorderDay(tuesdayInput(tuesdayDay(best)), TUESDAY)).toBeNull();
  });

  it('leaves a day with more than eight stops that could move as it is', () => {
    const many = Array.from({ length: 9 }, (_, n) => ({
      ...TUESDAY_ITEMS[1]!,
      stableId: `00000000-0000-4000-8000-0000000009${String(n).padStart(2, '0')}`,
      startsAt: at(13, clock(7 * 60 + n * 90)),
      endsAt: at(13, clock(7 * 60 + n * 90 + 60)),
    }));
    expect(reorderDay(tuesdayInput(tuesdayDay(many)), TUESDAY)).toBeNull();
  });
});
