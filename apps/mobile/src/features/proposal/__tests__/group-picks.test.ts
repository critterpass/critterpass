/**
 * The group version's cards come from the plan itself: the crew's must-dos, then one named stop
 * per other day, never more than the limit, never a stop with no name to show, and always read in
 * the plan's own order (day, then time).
 */
import { describe, expect, it } from '@jest/globals';

import { groupPicks, inPlanOrder } from '../data/picks';

const row = (
  stable_id: string,
  day_no: number,
  name: string | null,
  must_do_id: string | null = null,
) => ({
  stable_id,
  poi_id: null,
  name,
  must_do_title: must_do_id === null ? null : 'Bà Nà Hills',
  must_do_id,
  category: 'sight',
  day_no,
  starts_at: null,
  tz: null,
});

describe('groupPicks', () => {
  it('takes the must-dos and one named stop per other day, in the plan’s order', () => {
    const picks = groupPicks([
      row('a', 1, 'Mỹ Khê beach'),
      row('b', 1, 'Hàn market'),
      row('c', 2, null, 'm1'),
      row('d', 2, 'Dragon Bridge'),
      row('e', 3, null),
      row('f', 3, 'Sơn Trà'),
    ]);
    expect(picks.map((p) => [p.itemId, p.reasonTag, p.title])).toEqual([
      ['a', 'group_day', 'Mỹ Khê beach'],
      ['c', 'group_must_do', 'Bà Nà Hills'],
      ['f', 'group_day', 'Sơn Trà'],
    ]);
  });

  it('reads picks day by day, earlier first, with untimed stops after timed ones', () => {
    const stop = (id: string, dayNo: number | null, startsAt: string | null) => ({
      id,
      dayNo,
      startsAt,
    });
    const ordered = inPlanOrder([
      stop('noodles-16', 1, '2026-10-19T09:00:00Z'),
      stop('beach-14', 1, '2026-10-19T07:00:00Z'),
      stop('unplaced', null, null),
      stop('day-3', 3, null),
      stop('pagoda-1515', 1, '2026-10-19T08:15:00Z'),
      stop('day-2', 2, '2026-10-20T01:00:00Z'),
      stop('day-1-untimed', 1, null),
    ]);
    expect(ordered.map((s) => s.id)).toEqual([
      'beach-14',
      'pagoda-1515',
      'noodles-16',
      'day-1-untimed',
      'day-2',
      'day-3',
      'unplaced',
    ]);
  });

  it('keeps to the limit and shows nothing for a plan with no named stops', () => {
    const many = Array.from({ length: 9 }, (_, i) => row(`s${i}`, i + 1, `Stop ${i}`));
    expect(groupPicks(many)).toHaveLength(5);
    expect(groupPicks([row('x', 1, null)])).toEqual([]);
  });
});
