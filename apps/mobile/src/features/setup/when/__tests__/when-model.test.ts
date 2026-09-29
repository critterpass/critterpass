/**
 * The dates step's pure model: Monday-first months from per-date counts, the six heat steps scaled
 * to the crew, how many have shared anything, and which layout the step takes.
 */
import { describe, expect, it } from '@jest/globals';

import {
  heatMonths,
  heatStep,
  initialMonth,
  syncedCount,
  toOption,
  whenMode,
  type OptionRow,
  type SummaryRow,
} from '../model';

function day(date: string, free: number, unknown = 1): SummaryRow {
  return {
    date,
    free_count: free,
    maybe_count: 0,
    busy_count: 5 - free,
    unknown_count: unknown,
    member_count: 6,
    computed_at: null,
  };
}

const OPTION: OptionRow = {
  id: 'o1',
  position: 0,
  kind: 'partial',
  start_date: '2027-04-02',
  end_date: '2027-04-09',
  free_count: 5,
  member_count: 6,
  missing_member_ids: '["u-dev"]',
  missed_must_do_ids: '{m1,m2}',
  ask_user_id: null,
  ask_status: null,
  price_delta_minor: null,
  currency: null,
  reason: 'partial_crew',
  is_pick: 1,
};

describe('dates step model', () => {
  it('lays April 2027 out Monday-first with every day, counting missing days as nobody free', () => {
    const [april] = heatMonths([day('2027-04-02', 6), day('2027-04-30', 4)]);
    expect(april?.leadingBlanks).toBe(3);
    expect(april?.days).toHaveLength(30);
    expect(april?.days[0]).toEqual({ date: '2027-04-01', day: 1, free: 0, maybe: 0 });
    expect(april?.days[1]?.free).toBe(6);
  });

  it('spans several months in order', () => {
    const months = heatMonths([day('2027-06-01', 2), day('2027-04-01', 4), day('2027-05-10', 1)]);
    expect(months.map((month) => month.key)).toEqual(['2027-04', '2027-05', '2027-06']);
  });

  it('tints in six steps scaled to the crew, full only when everyone is free', () => {
    expect(heatStep(0, 6)).toBe(0.1);
    expect(heatStep(1, 6)).toBe(0.2);
    expect(heatStep(6, 6)).toBe(1);
    expect(heatStep(8, 16)).toBe(0.5);
    expect(heatStep(15, 16)).toBe(1);
    expect(heatStep(14, 16)).toBe(0.7);
    expect(heatStep(3, 0)).toBe(0.1);
  });

  it('counts people who shared anything from the best-known date', () => {
    expect(syncedCount([day('2027-04-01', 2, 3), day('2027-04-02', 2, 1)])).toBe(5);
    expect(syncedCount([])).toBe(0);
  });

  it('reads option rows, whatever shape the id lists sync in', () => {
    const option = toOption(OPTION);
    expect(option.missingIds).toEqual(['u-dev']);
    expect(option.missedMustDoIds).toEqual(['m1', 'm2']);
    expect(option.isPick).toBe(true);
    expect(option.askState).toBeNull();
  });

  it('picks the layout: best week, no fit, still working, or nobody yet', () => {
    const partial = toOption(OPTION);
    const best = toOption({ ...OPTION, kind: 'best', free_count: 6 });
    expect(whenMode([best], 6)).toBe('best');
    expect(whenMode([partial], 6)).toBe('no_fit');
    expect(whenMode([], 3)).toBe('computing');
    expect(whenMode([], 0)).toBe('empty');
  });

  it('opens on the best window’s month', () => {
    const months = heatMonths([day('2027-04-01', 1), day('2027-05-03', 6)]);
    const best = toOption({ ...OPTION, kind: 'best', start_date: '2027-05-03' });
    expect(initialMonth(months, best)).toBe(1);
    expect(initialMonth(months, null)).toBe(0);
  });
});
