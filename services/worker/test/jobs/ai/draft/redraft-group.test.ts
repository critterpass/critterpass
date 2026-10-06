import type { DayGroup, RedraftOutcome } from '@cp/ai';
import type { DraftDay, Itinerary } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { scopeRedraft } from '../../../../src/jobs/ai/draft/redraft-group';

const day = (dayNo: number, theme: string): DraftDay => ({
  day_no: dayNo,
  date: `2026-10-0${dayNo}`,
  theme,
  items: [],
});

const BASE: Itinerary = {
  currency: 'VND',
  days: [day(1, 'Đà Nẵng'), day(2, 'Đà Nẵng'), day(3, 'Hội An'), day(4, 'Đà Nẵng')],
};

const group = (dayNos: number[]) =>
  ({ destinationId: 'x', dayNos, input: {} }) as unknown as DayGroup;

describe('a redraft on a trip of several areas', () => {
  const groups = [group([1, 2, 4]), group([3])];

  it("redoes the day in its own group, on that group's days", () => {
    const scoped = scopeRedraft(groups, 4, BASE);
    expect(scoped?.dayNo).toBe(3);
    expect(scoped?.base.days.map((d) => [d.day_no, d.date])).toEqual([
      [1, '2026-10-01'],
      [2, '2026-10-02'],
      [3, '2026-10-04'],
    ]);
  });

  it('puts the new day back under its trip day number, the other areas untouched', () => {
    const scoped = scopeRedraft(groups, 4, BASE);
    if (scoped === null) throw new Error('scoped');
    const newDay = { ...day(3, 'Beach day'), date: '2026-10-04' };
    const outcome = {
      day: newDay,
      itinerary: { ...scoped.base, days: [...scoped.base.days.slice(0, 2), newDay] },
      title: null,
      summary: null,
      final: { ok: true, violations: [], costPpMinor: 0 },
      moved: [],
      leftOut: [],
      unknownIds: 0,
      proseRejected: 0,
    } satisfies RedraftOutcome;
    const back = scoped.back(outcome);
    expect(back.day.day_no).toBe(4);
    expect(back.itinerary.days.map((d) => [d.day_no, d.theme])).toEqual([
      [1, 'Đà Nẵng'],
      [2, 'Đà Nẵng'],
      [3, 'Hội An'],
      [4, 'Beach day'],
    ]);
  });

  it('leaves a trip of one area to the usual redraft', () => {
    expect(scopeRedraft([group([1, 2, 3, 4])], 2, BASE)).toBeNull();
    expect(scopeRedraft(undefined, 2, BASE)).toBeNull();
  });
});
