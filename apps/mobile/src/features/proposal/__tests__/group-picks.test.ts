/**
 * The group version's cards come from the plan itself: the crew's must-dos first, then one named
 * stop per day, never more than the limit, and never a stop with no name to show.
 */
import { describe, expect, it } from '@jest/globals';

import { groupPicks } from '../data/picks';

const row = (
  stable_id: string,
  day_no: number,
  name: string | null,
  must_do_id: string | null = null,
) => ({
  stable_id,
  name,
  must_do_title: must_do_id === null ? null : 'Bà Nà Hills',
  must_do_id,
  category: 'sight',
  day_no,
  starts_at: null,
  tz: null,
});

describe('groupPicks', () => {
  it('puts must-dos first, then one named stop per other day', () => {
    const picks = groupPicks([
      row('a', 1, 'Mỹ Khê beach'),
      row('b', 1, 'Hàn market'),
      row('c', 2, null, 'm1'),
      row('d', 2, 'Dragon Bridge'),
      row('e', 3, null),
      row('f', 3, 'Sơn Trà'),
    ]);
    expect(picks.map((p) => [p.itemId, p.reasonTag, p.title])).toEqual([
      ['c', 'group_must_do', 'Bà Nà Hills'],
      ['a', 'group_day', 'Mỹ Khê beach'],
      ['f', 'group_day', 'Sơn Trà'],
    ]);
  });

  it('keeps to the limit and shows nothing for a plan with no named stops', () => {
    const many = Array.from({ length: 9 }, (_, i) => row(`s${i}`, i + 1, `Stop ${i}`));
    expect(groupPicks(many)).toHaveLength(5);
    expect(groupPicks([row('x', 1, null)])).toEqual([]);
  });
});
