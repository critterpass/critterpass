/**
 * The PLACE THEM FOR ME line's counts, by the rule Tokek places with: an idea fits as it is only
 * when a day takes it for the whole crew with no stop moved and the crew isn't split on it;
 * everything else needs the crew; no fit yet is counted apart.
 */
import { describe, expect, it } from '@jest/globals';
import type { DayFit, StoredFit } from '@cp/domain';

import { gradesByDay, ideasSummary } from '../ideas-model';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const slot = { starts_at: '2026-10-17T08:00:00+08:00', ends_at: '2026-10-17T09:30:00+08:00' };

function stored(day: Partial<DayFit>, best = true): StoredFit {
  const full: DayFit = {
    day_id: id(105),
    day_no: 5,
    grade: 'good',
    slot,
    reasons: [],
    ...day,
  };
  return {
    poi_id: id(1),
    best: best ? { day_id: id(105), day_no: 5, grade: full.grade, slot } : null,
    days: [full],
    version_id: id(900),
    computed_at: '2026-10-04T00:00:00Z',
  };
}

describe('ideasSummary', () => {
  it('counts what fits as it is apart from what needs the crew', () => {
    const summary = ideasSummary([
      { fit: stored({}) },
      { fit: stored({ grade: 'possible', needs_move: id(7) }) },
      {
        fit: stored({
          grade: 'possible',
          reasons: [{ code: 'crew_split', params: { want: 2, rather_not: 2 } }],
        }),
      },
      { fit: stored({ grade: 'no', slot: null }, false) },
      // Only part of the crew is free for its one slot: the others are at another stop.
      {
        fit: stored({
          grade: 'possible',
          reasons: [{ code: 'who_free', params: { user_ids: [id(3), id(4)] } }],
        }),
      },
      { fit: null },
    ]);
    expect(summary).toEqual({ total: 6, fitting: 1, needCrew: 4, unknown: 1 });
  });

  it("reads each day's grade for the chips", () => {
    expect([...gradesByDay(stored({ grade: 'possible' }))]).toEqual([[5, 'possible']]);
    expect(gradesByDay(null).size).toBe(0);
  });
});
